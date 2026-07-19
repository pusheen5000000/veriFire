#!/usr/bin/env python3
"""QNX Pi 5 alarm outputs for VeriFire.

Use as a module::

    from alarm_controller import AlarmController
    alarm = AlarmController(); alarm.set_alarm_state("hazard")

Or test wiring from the command line::

    python3 alarm_controller.py hazard --hold 5
"""

from __future__ import annotations

import argparse
import os
import time


VALID_STATES = ("clear", "elevated", "benign", "hazard")
_default_controller: "AlarmController | None" = None


class AlarmController:
    """Control the active buzzer (GPIO27), passive buzzer (GPIO13), and relay (GPIO26)."""

    def __init__(
        self, active_pin: int = 27, passive_pin: int = 13, relay_pin: int = 26, active_low: bool = True
    ) -> None:
        try:
            import rpi_gpio as GPIO
        except ImportError as exc:
            raise RuntimeError("QNX rpi_gpio is unavailable; run qnx_preflight.py as root first.") from exc
        self.gpio = GPIO
        self.active_pin, self.passive_pin, self.relay_pin = active_pin, passive_pin, relay_pin
        self.active_low = active_low
        self.gpio.setmode(self.gpio.BCM)
        for pin in (active_pin, passive_pin, relay_pin):
            self.gpio.setup(pin, self.gpio.OUT)
        self._set_active_buzzer(False)
        self.gpio.output(relay_pin, self.gpio.LOW)
        self.passive_pwm = self.gpio.PWM(passive_pin, 440)
        self.passive_pwm.start(0)
        self.set_alarm_state("clear")

    def _set_active_buzzer(self, enabled: bool) -> None:
        """Support both direct active-high buzzers and active-low buzzer modules."""
        level = self.gpio.HIGH if enabled != self.active_low else self.gpio.LOW
        self.gpio.output(self.active_pin, level)

    def set_alarm_state(self, state: str) -> None:
        """Apply a safe, visible escalation level.  Relay only runs for hazards."""
        if state not in VALID_STATES:
            raise ValueError(f"state must be one of: {', '.join(VALID_STATES)}")
        self._set_active_buzzer(False)
        self.passive_pwm.ChangeDutyCycle(0)
        self.gpio.output(self.relay_pin, self.gpio.LOW)
        if state == "elevated":
            self.passive_pwm.ChangeFrequency(440)  # A4: soft alert
            self.passive_pwm.ChangeDutyCycle(35)
        elif state == "benign":
            self.passive_pwm.ChangeFrequency(523)  # C5: distinct but non-urgent
            self.passive_pwm.ChangeDutyCycle(45)
        elif state == "hazard":
            self._set_active_buzzer(True)
            self.passive_pwm.ChangeFrequency(1760)  # A6: urgent
            self.passive_pwm.ChangeDutyCycle(50)
            self.gpio.output(self.relay_pin, self.gpio.HIGH)

    def set_buzzer_mode(self, mode: str) -> None:
        """Set a buzzer-only lab indication without energizing the relay."""
        if mode not in ("silent", "passive", "active"):
            raise ValueError("mode must be silent, passive, or active")
        self._set_active_buzzer(False)
        self.passive_pwm.ChangeDutyCycle(0)
        self.gpio.output(self.relay_pin, self.gpio.LOW)
        if mode == "passive":
            self.passive_pwm.ChangeFrequency(440)
            self.passive_pwm.ChangeDutyCycle(35)
        elif mode == "active":
            self._set_active_buzzer(True)

    def close(self) -> None:
        self.set_alarm_state("clear")
        self.passive_pwm.stop()
        self.gpio.cleanup()


def set_alarm_state(state: str) -> None:
    """Convenience hook for the UI/inference process described in the guide."""
    global _default_controller
    if _default_controller is None:
        # The installed active buzzer is triggered by a LOW signal.  A caller
        # can explicitly opt into active-high wiring with VERIFIRE_ACTIVE_LOW=0.
        _default_controller = AlarmController(active_low=os.environ.get("VERIFIRE_ACTIVE_LOW", "1") != "0")
    _default_controller.set_alarm_state(state)


def main() -> int:
    parser = argparse.ArgumentParser(description="Test VeriFire alarm outputs")
    parser.add_argument("state", choices=VALID_STATES)
    parser.add_argument("--hold", type=float, default=3.0, help="seconds to hold the state")
    parser.add_argument("--active-low", action="store_true", default=True, help="active buzzer is triggered by LOW (default)")
    args = parser.parse_args()
    alarm = AlarmController(active_low=args.active_low)
    try:
        alarm.set_alarm_state(args.state)
        time.sleep(args.hold)
    finally:
        alarm.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
