import { Platform } from "react-native";

// LAN IP of the dev machine - update if your network changes
const DEV_LAN_IP = "192.168.2.201";

export function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (__DEV__) {
    // Android emulator uses 10.0.2.2 to reach host machine's localhost
    if (Platform.OS === "android") return "http://10.0.2.2:4000";
    // iOS simulator can use localhost directly
    if (Platform.OS === "ios") return "http://localhost:4000";
    // Web and physical devices use LAN IP
    return `http://${DEV_LAN_IP}:4000`;
  }

  // Production URL (update when deploying)
  return "http://localhost:4000";
}
