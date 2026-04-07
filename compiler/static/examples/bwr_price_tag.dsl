; BWR Price Tag - E-ink Shelf Label
; For BWR e-ink devices (black/white/red)

; White background (default)

; Top red banner
SET_COLOR 255 0 0
RECT_FILL 0 0 400 40

; Product name
SET_COLOR 0 0 0
TEXT 20.0 80.0 "Organic Coffee Beans"
TEXT 20.0 110.0 "500g Premium Blend"

; Price section
SET_COLOR 255 0 0
TEXT 20.0 180.0 "$12.99"

; Original price (strikethrough)
SET_COLOR 0 0 0
TEXT 200.0 180.0 "$15.99"
RECT_FILL 195 172 80 2

; Discount badge
SET_COLOR 255 0 0
RECT_FILL 300 130 90 50
SET_COLOR 255 255 255
TEXT 310.0 162.0 "-20%"

; Barcode placeholder
SET_COLOR 0 0 0
RECT_FILL 20 220 3 50
RECT_FILL 26 220 2 50
RECT_FILL 32 220 4 50
RECT_FILL 40 220 2 50
RECT_FILL 46 220 3 50
RECT_FILL 53 220 2 50
RECT_FILL 58 220 4 50
RECT_FILL 66 220 2 50
RECT_FILL 72 220 3 50
RECT_FILL 78 220 2 50
RECT_FILL 84 220 4 50
RECT_FILL 92 220 2 50
RECT_FILL 98 220 3 50

; SKU
TEXT 20.0 286.0 "SKU: CF-2026-001"

; Bottom border
SET_COLOR 0 0 0
RECT_FILL 0 296 400 4

END
