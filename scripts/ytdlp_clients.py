# Ported from yt-dlp (https://github.com/yt-dlp/yt-dlp, Unlicense): reads its InnerTube client data without importing it.
"""usage: python3 -I ytdlp_clients.py <_base.py> <_video.py> <vendor/_info.py>  -> JSON on stdout; exits 1 on any unknown shape."""
import ast
import json
import sys

POLICY_DEFAULTS = {'required': False, 'recommended': False, 'not_required_for_premium': False, 'not_required_with_player_token': False}
POLICY_CALLS = ('GvsPoTokenPolicy', 'PlayerPoTokenPolicy', 'SubsPoTokenPolicy')
CLIENT_KEYS = {
    'INNERTUBE_CONTEXT', 'INNERTUBE_CONTEXT_CLIENT_NAME', 'INNERTUBE_HOST', 'REQUIRE_JS_PLAYER', 'REQUIRE_AUTH',
    'SUPPORTS_COOKIES', 'SUPPORTS_AD_PLAYBACK_CONTEXT', 'GVS_PO_TOKEN_POLICY', 'PLAYER_PO_TOKEN_POLICY',
    'SUBS_PO_TOKEN_POLICY', 'AUTHENTICATED_USER_AGENT', 'PLAYER_PARAMS',
}


class Shape(Exception):
    pass


def ev(n, env):
    if isinstance(n, ast.Constant):
        return n.value
    if isinstance(n, ast.Dict):
        out = {}
        for k, v in zip(n.keys, n.values):
            if k is None:  # **SPREAD
                out.update(ev(v, env))
            else:
                out[str(ev(k, env))] = ev(v, env)
        return out
    if isinstance(n, (ast.Tuple, ast.List)):
        return [ev(e, env) for e in n.elts]
    if isinstance(n, ast.Name) and n.id in env:
        return env[n.id]
    if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == 'StreamingProtocol':
        return n.attr.lower()
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in POLICY_CALLS and not n.args:
        return {**POLICY_DEFAULTS, **{kw.arg: ev(kw.value, env) for kw in n.keywords}}
    raise Shape(f'unsupported node {ast.dump(n)[:160]} at line {getattr(n, "lineno", "?")}')


def module_assigns(src, names):
    env, lines = {}, {}
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in names:
                env[name] = ev(node.value, env)
                lines[name] = node.lineno
    missing = [n for n in names if n not in env]
    if missing:
        raise Shape(f'missing top-level assignments: {missing}')
    return env, lines


def clients_from(base_src):
    env, lines = module_assigns(base_src, ('WEB_PO_TOKEN_POLICIES', 'INNERTUBE_CLIENTS'))
    clients = env['INNERTUBE_CLIENTS']
    if not isinstance(clients, dict) or not clients:
        raise Shape('INNERTUBE_CLIENTS is not a non-empty dict')
    for name, c in clients.items():
        unknown = set(c) - CLIENT_KEYS
        if unknown:
            raise Shape(f'{name}: unknown keys {sorted(unknown)}')
        client = c.get('INNERTUBE_CONTEXT', {}).get('client')
        if not isinstance(client, dict) or not isinstance(client.get('clientName'), str) \
                or not isinstance(client.get('clientVersion'), str) \
                or not isinstance(c.get('INNERTUBE_CONTEXT_CLIENT_NAME'), int):
            raise Shape(f'{name}: missing clientName/clientVersion/INNERTUBE_CONTEXT_CLIENT_NAME')
        # mirror build_innertube_clients() defaults
        c.setdefault('INNERTUBE_HOST', 'www.youtube.com')
        c.setdefault('REQUIRE_JS_PLAYER', True)
        g = c.setdefault('GVS_PO_TOKEN_POLICY', {})
        for p in ('https', 'dash', 'hls'):
            g.setdefault(p, dict(POLICY_DEFAULTS))
        for k in ('PLAYER_PO_TOKEN_POLICY', 'SUBS_PO_TOKEN_POLICY'):
            c.setdefault(k, dict(POLICY_DEFAULTS))
        for k in ('REQUIRE_AUTH', 'SUPPORTS_COOKIES', 'SUPPORTS_AD_PLAYBACK_CONTEXT'):
            c.setdefault(k, False)
        client.setdefault('hl', 'en')
        if name.endswith('_embedded'):
            c['INNERTUBE_CONTEXT'].setdefault('thirdParty', {})['embedUrl'] = 'https://www.reddit.com/'
    return clients, lines['INNERTUBE_CLIENTS']


def defaults_from(video_src):
    out = {}
    for node in ast.walk(ast.parse(video_src)):
        if isinstance(node, ast.ClassDef) and node.name == 'YoutubeIE':
            for st in node.body:
                if isinstance(st, ast.Assign) and isinstance(st.targets[0], ast.Name):
                    name = st.targets[0].id
                    if name.startswith('_DEFAULT') and name.endswith('CLIENTS'):
                        out[name] = ev(st.value, {})
    if '_DEFAULT_CLIENTS' not in out:
        raise Shape('YoutubeIE._DEFAULT_CLIENTS not found')
    return out


def ejs_from(info_src):
    env = {}
    for node in ast.parse(info_src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            env[node.targets[0].id] = ast.literal_eval(node.value)
    version, hashes = env.get('VERSION'), env.get('HASHES')
    if not isinstance(version, str) or not isinstance(hashes, dict):
        raise Shape('vendor/_info.py lacks VERSION / HASHES')
    return {'version': version, 'sha3_512': hashes}


def main():
    base, video, info = (open(p, encoding='utf-8').read() for p in sys.argv[1:4])
    clients, line = clients_from(base)
    json.dump({'source_line': line, 'defaults': defaults_from(video), 'clients': clients, 'ejs': ejs_from(info)},
              sys.stdout, indent=1)


if __name__ == '__main__':
    try:
        main()
    except (Shape, KeyError, ValueError, SyntaxError) as e:
        print(f'ytdlp_clients: {type(e).__name__}: {e}', file=sys.stderr)
        sys.exit(1)
