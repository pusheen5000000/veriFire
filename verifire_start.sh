#!/bin/sh
# Starts the QNX hardware status display after the graphical QNX session is up.
# lcd_status.py also initializes GPIO27 HIGH, the quiet level for the installed
# active-low buzzer, before it touches the LCD.

set -eu
cd /data/home/qnxuser
export VERIFIRE_ACTIVE_LOW=1

# Keep producing fresh readings after every boot.  The LCD has a useful
# waiting screen immediately, then replaces it with these live statistics.
python3 /data/home/qnxuser/sensor_service.py \
  --pcf8591 --serial-port /dev/ser1 \
  --log /data/home/qnxuser/sensor_readings.jsonl \
  >> /data/home/qnxuser/sensor_service.out \
  2>> /data/home/qnxuser/sensor_service.err &

exec python3 /data/home/qnxuser/lcd_status.py /data/home/qnxuser/sensor_readings.jsonl --interval 3
