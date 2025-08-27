import React, { useEffect, useRef, useState, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  TextInput,
  Linking,
  Dimensions,
} from "react-native";
import * as Location from "expo-location";
import { LocationObject, LocationSubscription } from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE, Circle } from "react-native-maps";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import Purchases, {
  LOG_LEVEL,
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
} from "react-native-purchases";
import { RC_API_KEY_ANDROID, RC_API_KEY_IOS } from "@env";

// Notification Handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type LatLng = { latitude: number; longitude: number };

const toRad = (v: number) => (v * Math.PI) / 180;
const toDeg = (v: number) => (v * 180) / Math.PI;

const haversineMeters = (a: LatLng, b: LatLng) => {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const bearingDeg = (a: LatLng, b: LatLng) => {
  const φ1 = toRad(a.latitude),
    φ2 = toRad(b.latitude);
  const λ1 = toRad(a.longitude),
    λ2 = toRad(b.longitude);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const formatDistance = (m: number) => {
  const FT = 3.28084,
    MI = 1609.344;
  if (m < MI) {
    const ft = m * FT;
    return ft < 1000 ? `${Math.round(ft)} ft` : `${Math.round(ft / 100) * 100} ft`;
  }
  const mi = m / MI;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
};

const labelAccuracy = (m?: number | null) =>
  m == null ? "—" : m <= 10 ? "High" : m <= 30 ? "Med" : "Poor";

// RevenueCat Entitlement
const ENTITLEMENT_ID = "premium";

const MapMarkers = memo(({ current, saved, accuracyM, note }: {
  current: LatLng | null;
  saved: LatLng | null;
  accuracyM: number | null;
  note: string | null;
}) => (
  <>
    {current && accuracyM != null && accuracyM > 0 && (
      <Circle
        center={current}
        radius={accuracyM}
        strokeWidth={1}
        strokeColor="rgba(59,130,246,0.6)"
        fillColor="rgba(59,130,246,0.15)"
      />
    )}
    {saved && (
      <Marker
        coordinate={saved}
        title="Parked Car"
        description={note ?? "Saved location"}
        pinColor={Platform.OS === "android" ? "purple" : "red"}
      />
    )}
  </>
));

export default function Page() {
  const mapRef = useRef<MapView | null>(null);

  // Premium / settings
  const [isPremium, setIsPremium] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Location & state
  const [hasPerms, setHasPerms] = useState(false);
  const [current, setCurrent] = useState<LatLng | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);

  const [saved, setSaved] = useState<LatLng | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Distance & compass
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [targetBearing, setTargetBearing] = useState<number | null>(null);

  // Notes (Premium)
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // Timers
  const [timerOpen, setTimerOpen] = useState(false);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Init: permissions + saved state
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Location permission is needed to use this app.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      setHasPerms(true);

      try {
        const [rawSpot, rawTime, rawNote, rawCountdown] = await Promise.all([
          AsyncStorage.getItem("@car_spot"),
          AsyncStorage.getItem("@car_time"),
          AsyncStorage.getItem("@car_note"),
          AsyncStorage.getItem("@car_countdown_until"),
        ]);
        if (rawSpot) setSaved(JSON.parse(rawSpot));
        if (rawTime) setSavedAt(rawTime);
        if (rawNote) setNote(rawNote);
        if (rawCountdown) setCountdownEndsAt(Number(rawCountdown) || null);
      } catch (e) {
        Alert.alert("Error", "Failed to load saved data.");
      }

      try {
        const loc: LocationObject = await Location.getCurrentPositionAsync({});
        setCurrent({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setAccuracyM(loc.coords.accuracy ?? null);
        setLastFixAt(Date.now());
      } catch (e) {
        Alert.alert("Error", "Failed to get current location.");
      }
    })();

    Notifications.requestPermissionsAsync();
  }, []);

  // Init: RevenueCat
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "ios") {
          await Purchases.configure({ apiKey: RC_API_KEY_IOS });
        } else if (Platform.OS === "android") {
          await Purchases.configure({ apiKey: RC_API_KEY_ANDROID });
        }
        Purchases.setLogLevel(LOG_LEVEL.WARN);
        const info: CustomerInfo = await Purchases.getCustomerInfo();
        const active = !!info.entitlements.active[ENTITLEMENT_ID];
        setIsPremium(active);
        await AsyncStorage.setItem("@is_premium", String(active));
      } catch (e) {
        Alert.alert("Error", "Failed to initialize premium features.");
      }
    })();
  }, []);

  // Live location
  useEffect(() => {
    let sub: LocationSubscription | undefined;
    (async () => {
      if (!hasPerms) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
        (loc: LocationObject) => {
          setCurrent({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          setAccuracyM(loc.coords.accuracy ?? null);
          setLastFixAt(Date.now());
        }
      );
    })();
    return () => sub?.remove();
  }, [hasPerms]);

  // Heading
  useEffect(() => {
    let headingSub: LocationSubscription | undefined;
    (async () => {
      if (!hasPerms) return;
      try {
        headingSub = await Location.watchHeadingAsync((h) => {
          const deg =
            typeof h.trueHeading === "number" && h.trueHeading >= 0
              ? h.trueHeading
              : typeof h.magHeading === "number"
              ? h.magHeading
              : null;
          if (deg !== null) setHeadingDeg((deg + 360) % 360);
        });
      } catch {}
    })();
    return () => headingSub?.remove();
  }, [hasPerms]);

  // Distance + bearing
  useEffect(() => {
    if (current && saved) {
      const m = haversineMeters(current, saved);
      setDistanceM(m);
      setTargetBearing(bearingDeg(current, saved));
    } else {
      setDistanceM(null);
      setTargetBearing(null);
    }
  }, [current, saved]);

  // Tick for countdown
  useEffect(() => {
    if (!countdownEndsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [countdownEndsAt]);

  // Notify when countdown ends
  useEffect(() => {
    if (!countdownEndsAt || countdownEndsAt > Date.now()) return;
    Notifications.scheduleNotificationAsync({
      content: { title: "⏱ Parking Countdown", body: "Your parking time is up!" },
      trigger: null,
    });
    clearCountdown();
  }, [countdownEndsAt, nowTick]);

  // RevenueCat helpers
  const refreshPremiumFromInfo = async (info: CustomerInfo) => {
    const active = !!info.entitlements.active[ENTITLEMENT_ID];
    setIsPremium(active);
    try {
      await AsyncStorage.setItem("@is_premium", String(active));
    } catch (e) {
      Alert.alert("Error", "Failed to save premium status.");
    }
  };

  const openPaywall = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const current: PurchasesOffering | null = offerings.current ?? null;
      const pkg: PurchasesPackage | undefined = current?.availablePackages?.[0];
      if (!pkg) {
        Alert.alert("No products", "Products aren’t configured yet in RevenueCat.");
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      await refreshPremiumFromInfo(customerInfo);
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        Alert.alert("Thanks! 🎉", "Premium is now unlocked on this device.");
      }
    } catch (e: any) {
      if (e?.userCancelled) return;
      Alert.alert("Purchase failed", String(e?.message || e));
    }
  };

  const restorePurchases = async () => {
    try {
      const info: CustomerInfo = await Purchases.restorePurchases();
      await refreshPremiumFromInfo(info);
    } catch (e: any) {
      Alert.alert("Restore failed", String(e?.message || e));
    }
  };

  // Map helpers
  const quickCenter = () => {
    if (!current || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { ...current, latitudeDelta: 0.0025, longitudeDelta: 0.0025 },
      500
    );
  };

  const fitToMarkers = () => {
    if (!current) return Alert.alert("Hold on", "Still getting your location…");
    if (!saved) return Alert.alert("No saved spot", "Tap “Save” where you parked first.");
    if (!mapRef.current) return;
    mapRef.current.fitToCoordinates([current, saved], {
      edgePadding: { top: 80, bottom: 80, left: 80, right: 80 },
      animated: true,
    });
  };

  // Save/Clear
  const saveSpot = async () => {
    if (!current) return Alert.alert("Locating…", "Current GPS not ready yet.");
    if (saved) {
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Overwrite saved spot?",
          "Replace your saved location with your current location?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Overwrite", style: "destructive", onPress: () => resolve(true) },
          ]
        );
      });
      if (!ok) return;
    }
    const spot = { ...current };
    setSaved(spot);
    try {
      await AsyncStorage.setItem("@car_spot", JSON.stringify(spot));
      const nowIso = new Date().toISOString();
      setSavedAt(nowIso);
      await AsyncStorage.setItem("@car_time", nowIso);
      Alert.alert("Saved ✅", "Your parking location has been saved.");
      fitToMarkers();
    } catch (e) {
      Alert.alert("Error", "Failed to save location.");
    }
  };

  const clearSpot = async () => {
    if (!saved) return Alert.alert("No saved spot", "Tap “Save” where you parked first.");
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Clear saved spot?",
        "This will remove your saved location and any notes.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Clear", style: "destructive", onPress: () => resolve(true) },
        ]
      );
    });
    if (!ok) return;
    setSaved(null);
    setSavedAt(null);
    setNote(null);
    try {
      await AsyncStorage.multiRemove(["@car_spot", "@car_time", "@car_note"]);
    } catch (e) {
      Alert.alert("Error", "Failed to clear saved data.");
    }
  };

  // Reminders (free)
  const scheduleReminder = async (minutes: number) => {
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert("Set reminder?", `Notify you in ${minutes} minutes?`, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Set", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "⏰ Parking Reminder",
          body: `Reminder set for ${minutes} minutes.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: minutes * 60,
          repeats: false,
        },
      });
      setTimerOpen(false);
      Alert.alert("Reminder set", `I'll remind you in ${minutes} minutes.`);
    } catch (e) {
      Alert.alert("Couldn’t schedule reminder", String(e));
    }
  };

  // Countdown (premium)
  const startCountdown = async (minutes: number) => {
    if (!isPremium) {
      Alert.alert("Premium feature", "Live countdown requires Premium.", [
        { text: "Restore", onPress: restorePurchases },
        { text: "Not now", style: "cancel" },
        { text: "Upgrade", onPress: openPaywall },
      ]);
      return;
    }
    const end = Date.now() + minutes * 60 * 1000;
    setCountdownEndsAt(end);
    try {
      await AsyncStorage.setItem("@car_countdown_until", String(end));
    } catch (e) {
      Alert.alert("Error", "Failed to save countdown.");
    }
  };

  const extendCountdown = async (minutes: number) => {
    if (!isPremium || !countdownEndsAt) return;
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert("Extend timer?", `Add ${minutes} minutes to your countdown?`, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Extend", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;
    const newEnd = countdownEndsAt + minutes * 60 * 1000;
    setCountdownEndsAt(newEnd);
    try {
      await AsyncStorage.setItem("@car_countdown_until", String(newEnd));
    } catch (e) {
      Alert.alert("Error", "Failed to extend countdown.");
    }
  };

  const clearCountdown = async () => {
    setCountdownEndsAt(null);
    try {
      await AsyncStorage.removeItem("@car_countdown_until");
    } catch (e) {
      Alert.alert("Error", "Failed to clear countdown.");
    }
  };

  const arrowRotation = (() => {
    if (headingDeg == null || targetBearing == null) return 0;
    let rot = (targetBearing - headingDeg) % 360;
    if (rot < 0) rot += 360;
    return rot;
  })();

  const savedAtLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  const lastFixLabel = (() => {
    if (!lastFixAt) return "—";
    const s = Math.max(0, Math.floor((Date.now() - lastFixAt) / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  })();

  const countdownLabel = (() => {
    if (!countdownEndsAt) return null;
    const ms = Math.max(0, countdownEndsAt - Date.now());
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🚗 Find My Car</Text>
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={22} color="#cfe7ff" />
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          provider={PROVIDER_GOOGLE}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          showsUserLocation
          onMapReady={quickCenter}
          initialRegion={{
            latitude: current?.latitude ?? 37.78825,
            longitude: current?.longitude ?? -122.4324,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <MapMarkers current={current} saved={saved} accuracyM={accuracyM} note={note} />
        </MapView>

        {saved && (
          <View style={styles.compassWrap}>
            <View style={styles.compass}>
              <View style={{ transform: [{ rotate: `${arrowRotation}deg` }] }}>
                <MaterialIcons name="navigation" size={26} color="#ff5d5d" />
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          {saved
            ? distanceM != null
              ? `${formatDistance(distanceM)} • Saved ${savedAtLabel ?? ""}`
              : "Saved spot"
            : "Save your spot to begin"}
          {accuracyM != null ? ` • GPS ${labelAccuracy(accuracyM)}` : ""}
          {note ? ` • “${note}”` : ""}
        </Text>

        {isPremium ? (
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Countdown", "Extend or clear your countdown?", [
                { text: "Cancel", style: "cancel" },
                { text: "+5 min", onPress: () => extendCountdown(5) },
                { text: "Clear", style: "destructive", onPress: clearCountdown },
              ]);
            }}
            accessibilityLabel="Manage countdown timer"
          >
            <Text style={styles.statusIcon}>
              {countdownLabel ? `⏱ ${countdownLabel}` : "⏱"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setTimerOpen(true)}
            accessibilityLabel="Set parking reminder"
          >
            <Text style={styles.statusIcon}>⏰</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.toolbarRow}>
        <SmallBtn
          text={saved ? "Find" : "Save"}
          onPress={saved ? fitToMarkers : saveSpot}
          accessibilityLabel={saved ? "Find saved car location" : "Save current location"}
        />
        <SmallBtn text="Center" onPress={fitToMarkers} accessibilityLabel="Center map on locations" />
        <SmallBtn
          text="Notes"
          onPress={() => {
            if (!isPremium) {
              Alert.alert(
                "Premium feature",
                "Add garage level, aisle, color… Unlock Notes with Premium.",
                [
                  { text: "Restore", onPress: restorePurchases },
                  { text: "Not now", style: "cancel" },
                  { text: "Upgrade", onPress: openPaywall },
                ]
              );
              return;
            }
            setNoteDraft(note ?? "");
            setNoteOpen(true);
          }}
          accessibilityLabel="Add parking note"
        />
        <SmallBtn text="Clear" onPress={clearSpot} accessibilityLabel="Clear saved location" />
      </View>

      {/* Notes Modal (Premium) */}
      <Modal visible={noteOpen} animationType="slide" transparent onRequestClose={() => setNoteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📝 Parking Note</Text>
            <Text style={styles.modalSub}>Add a quick note like “Level 2 • Aisle B”.</Text>

            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="e.g., Level 2, Aisle B"
              placeholderTextColor="#8696a7"
              style={styles.input}
              accessibilityLabel="Parking note input"
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={[styles.modalClose, { flex: 1, backgroundColor: "#1f2937" }]}
                onPress={() => setNoteOpen(false)}
                accessibilityLabel="Cancel note"
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalClose, { flex: 1 }]}
                onPress={async () => {
                  const trimmed = noteDraft.trim();
                  setNote(trimmed || null);
                  try {
                    await AsyncStorage.setItem("@car_note", trimmed);
                    setNoteOpen(false);
                  } catch (e) {
                    Alert.alert("Error", "Failed to save note.");
                  }
                }}
                accessibilityLabel="Save note"
              >
                <Text style={styles.modalCloseText}>Save Note</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Simple Reminder Modal (Free) */}
      <Modal visible={timerOpen} animationType="slide" transparent onRequestClose={() => setTimerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⏰ Parking Reminder</Text>
            <Text style={styles.modalSub}>Choose how long to set a reminder for:</Text>
            <View style={styles.modalRow}>
              {[15, 30, 60, 90, 120].map((m) => (
                <Pressable
                  key={m}
                  style={styles.modalBtn}
                  onPress={() => scheduleReminder(m)}
                  accessibilityLabel={`Set reminder for ${m} minutes`}
                >
                  <Text style={styles.modalBtnText}>{m}m</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.modalClose, { backgroundColor: "#1f2937" }]}
              onPress={() => startCountdown(60)}
              accessibilityLabel="Try live countdown for 60 minutes"
            >
              <Text style={styles.modalCloseText}>Try live countdown (60m)</Text>
            </Pressable>

            <Pressable
              style={styles.modalClose}
              onPress={() => setTimerOpen(false)}
              accessibilityLabel="Close reminder modal"
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Settings Sheet */}
      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Settings</Text>

            <Pressable
              style={styles.rowBtn}
              onPress={restorePurchases}
              accessibilityLabel="Restore purchases"
            >
              <Ionicons name="refresh-circle-outline" size={20} color="#cfe7ff" />
              <Text style={styles.rowBtnText}>Restore Purchases</Text>
            </Pressable>

            <Pressable
              style={styles.rowBtn}
              onPress={() => Linking.openURL("https://your-privacy-url.com")}
              accessibilityLabel="View privacy policy"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#cfe7ff" />
              <Text style={styles.rowBtnText}>Privacy Policy</Text>
            </Pressable>

            <Pressable
              style={styles.rowBtn}
              onPress={() => Linking.openURL("https://your-terms-url.com")}
              accessibilityLabel="View terms of service"
            >
              <Ionicons name="document-text-outline" size={20} color="#cfe7ff" />
              <Text style={styles.rowBtnText}>Terms of Service</Text>
            </Pressable>

            <Pressable
              style={styles.rowBtn}
              onPress={() =>
                Linking.openURL("mailto:support@example.com?subject=Find%20My%20Car%20Support")
              }
              accessibilityLabel="Contact support"
            >
              <Ionicons name="mail-outline" size={20} color="#cfe7ff" />
              <Text style={styles.rowBtnText}>Contact Support</Text>
            </Pressable>

            <Pressable
              style={[styles.modalClose, { marginTop: 8 }]}
              onPress={() => setSettingsOpen(false)}
              accessibilityLabel="Close settings"
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SmallBtn({
  text,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.smallBtn, disabled && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.smallBtnText} numberOfLines={1}>
        {text}
      </Text>
    </TouchableOpacity>
  );
}

const mapHeight = Dimensions.get("window").height * 0.5;

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 36, paddingHorizontal: 12, backgroundColor: "#0b0f15" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", color: "white" },
  mapWrap: { height: mapHeight, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#233", marginBottom: 8 },
  compassWrap: { position: "absolute", top: 12, right: 12, alignItems: "flex-end" },
  compass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(17,24,39,0.92)",
    borderWidth: 1,
    borderColor: "#2b3946",
    justifyContent: "center",
    alignItems: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  statusText: { color: "#cfe7ff", fontSize: 13, flex: 1, paddingRight: 10 },
  statusIcon: { color: "#cfe7ff", fontSize: 16 },
  toolbarRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  smallBtn: { backgroundColor: "#2563eb", paddingVertical: 10, borderRadius: 8, flex: 1, alignItems: "center", minWidth: 0 },
  smallBtnText: { color: "white", fontWeight: "700", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#0b0f15", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, borderTopWidth: 1, borderColor: "#233" },
  modalTitle: { color: "white", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  modalSub: { color: "#9fb3c6", marginBottom: 10 },
  modalRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  modalBtn: { backgroundColor: "#1f2937", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  modalBtnText: { color: "white", fontWeight: "700" },
  modalClose: { backgroundColor: "#2563eb", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  modalCloseText: { color: "white", fontWeight: "700" },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#25303a",
  },
  rowBtnText: { color: "white", fontWeight: "700" },
  input: {
    backgroundColor: "#111827",
    color: "white",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3946",
    marginBottom: 12,
  },
});