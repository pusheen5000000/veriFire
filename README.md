# veriFire

## Raspberry Pi camera feed

This dashboard now reads a live camera stream from a Raspberry Pi endpoint instead of the browser's local webcam.

By default the frontend looks for `/stream.mjpg` on the same origin. You can also override the source with `window.VERIFIRE_CAMERA_STREAM_URL` or the `?camera=` query parameter.

If you want the repo to serve the stream directly from the Pi, run the included Flask example on the Raspberry Pi 5:

```bash
pip install flask picamera2
python3 pi_camera_server.py
```

Then open the dashboard at `http://<raspberry-pi-ip>:8000/`.