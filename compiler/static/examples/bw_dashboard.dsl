; BW Dashboard - Status Display
; For BW e-ink devices

; Border
SET_COLOR 0 0 0
RECT_FILL 0 0 400 2
RECT_FILL 0 298 400 2
RECT_FILL 0 0 2 300
RECT_FILL 398 0 2 300

; Header
SET_COLOR 0 0 0
RECT_FILL 0 0 400 36
SET_COLOR 255 255 255
TEXT 140.0 26.0 "Status Panel"

; Divider
SET_COLOR 0 0 0
RECT_FILL 0 38 400 1

; Section 1: Temperature
SET_COLOR 0 0 0
TEXT 20.0 70.0 "Temperature"
TEXT 280.0 70.0 "23 C"

; Section 2: Humidity
RECT_FILL 10 85 380 1
TEXT 20.0 110.0 "Humidity"
TEXT 280.0 110.0 "65%"

; Section 3: Battery
RECT_FILL 10 125 380 1
TEXT 20.0 150.0 "Battery"
TEXT 280.0 150.0 "87%"

; Battery icon
RECT_FILL 340 140 40 16
RECT_FILL 380 144 4 8
SET_COLOR 255 255 255
RECT_FILL 342 142 36 12
SET_COLOR 0 0 0
RECT_FILL 342 142 31 12

; Section 4: WiFi
RECT_FILL 10 165 380 1
TEXT 20.0 190.0 "WiFi"
TEXT 280.0 190.0 "OK"

; Footer
RECT_FILL 0 260 400 1
TEXT 20.0 284.0 "Last update: 15:30"

END
