package expo.modules.quicksos

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PowerPressDetectorTest {
  @Test
  fun threeQuickPressesTrigger() {
    val d = PowerPressDetector()
    assertFalse(d.onPress(1_000))
    assertFalse(d.onPress(1_400))
    assertTrue(d.onPress(1_800))
  }

  @Test
  fun resetsAfterTriggerSoNextNeedsThreeAgain() {
    val d = PowerPressDetector()
    d.onPress(0)
    d.onPress(300)
    assertTrue(d.onPress(600))
    assertFalse(d.onPress(900))
    assertFalse(d.onPress(1_200))
    assertTrue(d.onPress(1_500))
  }

  @Test
  fun slowPressesDoNotTrigger() {
    val d = PowerPressDetector()
    assertFalse(d.onPress(0))
    assertFalse(d.onPress(2_500))
    assertFalse(d.onPress(5_000))
    assertFalse(d.onPress(7_500))
  }

  @Test
  fun lateScreenOffEventStillCounts() {
    // Visto no emulador: ON 0 ms, OFF +1353 ms (atrasado), ON +1507 ms.
    val d = PowerPressDetector()
    assertFalse(d.onPress(0))
    assertFalse(d.onPress(1_353))
    assertTrue(d.onPress(1_507))
  }

  @Test
  fun longGapRestartsCount() {
    val d = PowerPressDetector()
    d.onPress(0)
    d.onPress(500)
    assertFalse(d.onPress(3_000)) // gap 2500 > 2000: recomeça
    assertFalse(d.onPress(3_400))
    assertTrue(d.onPress(3_800))
  }

  @Test
  fun totalWindowIsEnforced() {
    val d = PowerPressDetector(requiredPresses = 3, maxGapMs = 1_500, windowMs = 2_000)
    d.onPress(0)
    d.onPress(1_400)
    // 3o toque a 2800 ms do 1o: fora da janela, sobram 2 toques
    assertFalse(d.onPress(2_800))
    assertTrue(d.onPress(3_200))
  }

  @Test
  fun clockGoingBackwardsResets() {
    val d = PowerPressDetector()
    d.onPress(5_000)
    d.onPress(5_300)
    assertFalse(d.onPress(100))
  }
}
