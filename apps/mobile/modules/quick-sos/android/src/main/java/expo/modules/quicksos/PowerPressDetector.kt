package expo.modules.quicksos

/**
 * Reconhece N toques no botão liga/desliga a partir dos eventos de tela ligada/desligada
 * (cada toque alterna a tela). Lógica pura, sem Android, para ser testável.
 *
 * - [maxGapMs]: intervalo máximo entre dois toques seguidos (senão recomeça a contagem).
 *   Folgado de propósito: o SCREEN_OFF chega ~1 s depois do toque (animação de apagar).
 * - [windowMs]: tempo máximo do primeiro ao último toque.
 */
class PowerPressDetector(
  private val requiredPresses: Int = 3,
  private val maxGapMs: Long = 2_000,
  private val windowMs: Long = 5_000,
) {
  private val presses = ArrayDeque<Long>()

  /** Registra um toque em [atMs] (relógio monotônico). Retorna true quando o gesto completa. */
  @Synchronized
  fun onPress(atMs: Long): Boolean {
    val last = presses.lastOrNull()
    if (last != null && (atMs < last || atMs - last > maxGapMs)) {
      presses.clear()
    }
    presses.addLast(atMs)
    while (presses.isNotEmpty() && atMs - presses.first() > windowMs) {
      presses.removeFirst()
    }
    if (presses.size >= requiredPresses) {
      presses.clear()
      return true
    }
    return false
  }

  @Synchronized
  fun reset() {
    presses.clear()
  }
}
