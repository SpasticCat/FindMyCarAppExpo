import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    console.log("RootLayout mounted. Attempting to load routes...");
  }, []);

  try {
    console.log("Rendering Stack with index route...");
    return (
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: "Not Found" }} />
      </Stack>
    );
  } catch (e) {
    console.error("Error in RootLayout:", e);
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Error loading app: {e.message}</Text>
      </View>
    );
  }
}