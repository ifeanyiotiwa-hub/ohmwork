package dev.engineeringcircuit.app

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** The app's canvas colour (--canvas-bg), shown behind the status and navigation bars. */
private val CANVAS_BACKGROUND = Color.parseColor("#0f1419")

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Light status bar icons on the app's dark background.
    enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(CANVAS_BACKGROUND)
    keepClearOfSystemBars(findViewById(android.R.id.content))
  }

  /** Edge to edge, the web view would draw under the bars and the notch; this webview does not report them to CSS. */
  private fun keepClearOfSystemBars(content: View) {
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
