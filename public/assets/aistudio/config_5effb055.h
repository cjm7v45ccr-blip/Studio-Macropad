#pragma once

// Studio MacroPad hardware configuration for ESP32-WROOM-32.
// Keep credentials out of this file. Configure Wi-Fi and Vizio pairing from
// the device's setup portal; both are stored in ESP32 Preferences.

#define FIRMWARE_VERSION "2.0.0"
#define API_VERSION 1

// Hardware pins
#define PIN_BTN1        26
#define PIN_BTN2        27
#define PIN_BTN3        14
#define PIN_BTN4        16
#define PIN_BTN_MODE    23

#define PIN_ENC_CLK     33
#define PIN_ENC_DT      32
#define PIN_ENC_SW      25

#define PIN_LED_BT      18
#define PIN_LED_WIFI    19

#define OLED_SDA        21
#define OLED_SCL        22
#define OLED_ADDR       0x3C
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64

// The actual setup SSID and password include the final six hex digits of the
// ESP32 MAC address. They are displayed on the OLED when setup mode is active.
#define SETUP_AP_PREFIX "StudioPad"

// Vizio defaults intentionally contain no user credential or assumed LAN host.
#define DEFAULT_TV_IP   ""
#define DEFAULT_TV_PORT 7345
#define DEFAULT_TV_AUTH ""
