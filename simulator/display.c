#include "display.h"
#include "platform/platform.h"
#include "platform/pc/minpng.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdlib.h>
#include <string.h>

void display_write_png(const char *path, const uint8_t *rgb, int32_t w, int32_t h) {
    if (minpng_write(path, rgb, w, h) == 0)
        platform_log("Written %s (%dx%d)\n", path, w, h);
    else
        platform_log("Error writing %s\n", path);
}

static uint8_t *s_dib_bits;
static BITMAPINFO s_bmi;
static int32_t s_w, s_h;

static display_tick_fn s_tick_fn;
static void *s_tick_user;
static uint8_t *s_tick_rgb;
static HWND s_hwnd;

#define TICK_TIMER_ID 1

static void rgb_to_dib(const uint8_t *rgb, uint8_t *dib, int32_t w, int32_t h) {
    int32_t stride = ((w * 3 + 3) & ~3);
    for (int32_t y = 0; y < h; y++) {
        const uint8_t *src = rgb + y * w * 3;
        uint8_t *dst = dib + (h - 1 - y) * stride;
        for (int32_t x = 0; x < w; x++) {
            dst[x * 3 + 0] = src[x * 3 + 2];
            dst[x * 3 + 1] = src[x * 3 + 1];
            dst[x * 3 + 2] = src[x * 3 + 0];
        }
    }
}

static void refresh_dib(void) {
    if (s_tick_rgb && s_dib_bits)
        rgb_to_dib(s_tick_rgb, s_dib_bits, s_w, s_h);
}

static LRESULT CALLBACK wnd_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        SetDIBitsToDevice(hdc, 0, 0,
                          s_bmi.bmiHeader.biWidth,
                          abs(s_bmi.bmiHeader.biHeight),
                          0, 0, 0,
                          abs(s_bmi.bmiHeader.biHeight),
                          s_dib_bits, &s_bmi, DIB_RGB_COLORS);
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_TIMER:
        if (wp == TICK_TIMER_ID && s_tick_fn) {
            if (s_tick_fn(s_tick_rgb, s_w, s_h, s_tick_user)) {
                refresh_dib();
                InvalidateRect(hwnd, NULL, FALSE);
            }
        }
        return 0;
    case WM_KEYDOWN:
        if (wp == VK_ESCAPE)
            PostQuitMessage(0);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcA(hwnd, msg, wp, lp);
}

static HWND create_window(int32_t w, int32_t h) {
    WNDCLASSA wc = {0};
    wc.lpfnWndProc = wnd_proc;
    wc.hInstance = GetModuleHandleA(NULL);
    wc.lpszClassName = "graphvm";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    RegisterClassA(&wc);

    RECT rc = {0, 0, w, h};
    AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);

    return CreateWindowA("graphvm", "graphVM Simulator",
                         WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                         CW_USEDEFAULT, CW_USEDEFAULT,
                         rc.right - rc.left, rc.bottom - rc.top,
                         NULL, NULL, wc.hInstance, NULL);
}

static void init_bmi(int32_t w, int32_t h) {
    s_w = w; s_h = h;
    memset(&s_bmi, 0, sizeof(s_bmi));
    s_bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    s_bmi.bmiHeader.biWidth = w;
    s_bmi.bmiHeader.biHeight = h;
    s_bmi.bmiHeader.biPlanes = 1;
    s_bmi.bmiHeader.biBitCount = 24;
    s_bmi.bmiHeader.biCompression = BI_RGB;
}

static void run_message_loop(void) {
    MSG msg;
    while (GetMessageA(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageA(&msg);
    }
}

void display_show_window(const uint8_t *rgb, int32_t w, int32_t h) {
    int32_t stride = ((w * 3 + 3) & ~3);
    s_dib_bits = (uint8_t *)calloc((size_t)(stride * h), 1);
    init_bmi(w, h);
    rgb_to_dib(rgb, s_dib_bits, w, h);

    s_tick_fn = NULL;
    s_tick_user = NULL;
    s_tick_rgb = NULL;

    s_hwnd = create_window(w, h);
    run_message_loop();
    free(s_dib_bits);
}

void display_show_window_ex(uint8_t *rgb, int32_t w, int32_t h,
                            display_tick_fn tick, void *user, uint32_t tick_ms) {
    int32_t stride = ((w * 3 + 3) & ~3);
    s_dib_bits = (uint8_t *)calloc((size_t)(stride * h), 1);
    init_bmi(w, h);
    rgb_to_dib(rgb, s_dib_bits, w, h);

    s_tick_fn = tick;
    s_tick_user = user;
    s_tick_rgb = rgb;

    s_hwnd = create_window(w, h);

    if (tick && tick_ms > 0)
        SetTimer(s_hwnd, TICK_TIMER_ID, tick_ms, NULL);

    run_message_loop();

    KillTimer(s_hwnd, TICK_TIMER_ID);
    free(s_dib_bits);
}

void display_resize(uint8_t *rgb, int32_t w, int32_t h) {
    free(s_dib_bits);
    int32_t stride = ((w * 3 + 3) & ~3);
    s_dib_bits = (uint8_t *)calloc((size_t)(stride * h), 1);
    init_bmi(w, h);
    s_tick_rgb = rgb;
    rgb_to_dib(rgb, s_dib_bits, w, h);

    if (s_hwnd) {
        RECT rc = {0, 0, w, h};
        AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
        SetWindowPos(s_hwnd, NULL, 0, 0,
                     rc.right - rc.left, rc.bottom - rc.top,
                     SWP_NOMOVE | SWP_NOZORDER);
        InvalidateRect(s_hwnd, NULL, TRUE);
    }
}
