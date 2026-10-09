package expo.modules.flowisland

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import java.util.Locale

class FlowIslandModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  @Volatile private var listening = false

  override fun definition() = ModuleDefinition {
    Name("FlowIsland")

    Events("onAction")

    OnCreate { instance = WeakReference(this@FlowIslandModule) }

    OnDestroy {
      if (instance?.get() === this@FlowIslandModule) instance = null
    }

    OnStartObserving("onAction") { listening = true }

    OnStopObserving("onAction") { listening = false }

    Function<Boolean>("hasOverlayPermission") { IslandPill.canDraw(context) }

    Function<String>("manufacturer") { Build.MANUFACTURER.orEmpty().lowercase(Locale.ROOT) }

    AsyncFunction<Boolean>("requestOverlayPermission") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("show") { state: PillState -> Island.show(context, state.toSnapshot()) }

    AsyncFunction("update") { state: PillState -> Island.update(context, state.toSnapshot()) }

    AsyncFunction<Unit>("hide") { Island.hide() }

    AsyncFunction<Boolean>("openBatterySettings") { openBatterySettings() }.runOnQueue(Queues.MAIN)
  }

  /** Opens the vendor autostart screen where there is one, else the system battery list. */
  private fun openBatterySettings(): Boolean {
    val vendor = Build.MANUFACTURER.orEmpty().lowercase(Locale.ROOT)
    val pkg = context.packageName
    val candidates = mutableListOf<Intent>()
    fun component(p: String, c: String) = candidates.add(Intent().setComponent(ComponentName(p, c)))
    when {
      vendor.contains("xiaomi") || vendor.contains("redmi") || vendor.contains("poco") -> {
        candidates.add(
          Intent("miui.intent.action.APP_PERM_EDITOR")
            .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
            .putExtra("extra_pkgname", pkg)
        )
        component("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
      }
      vendor.contains("oppo") || vendor.contains("realme") || vendor.contains("oneplus") -> {
        component("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
        component("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
        component("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
      }
      vendor.contains("vivo") || vendor.contains("iqoo") -> {
        component("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
        component("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")
      }
    }
    candidates.add(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    candidates.add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")))
    return candidates.any { launch(it) }
  }

  private fun launch(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (_: Throwable) {
      false
    }
  }

  companion object {
    @Volatile private var instance: WeakReference<FlowIslandModule>? = null

    /** Sends a widget button to JS. False when no JS listener is alive. */
    fun emitAction(action: String): Boolean {
      val module = instance?.get() ?: return false
      if (!module.listening) return false
      return try {
        module.sendEvent("onAction", mapOf("action" to action))
        true
      } catch (_: Throwable) {
        false
      }
    }
  }
}
