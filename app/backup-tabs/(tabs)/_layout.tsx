// app/(tabs)/_layout.tsx
import React from "react";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Home" }}
      />
      {/* You can add more tabs later, e.g.:
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      */}
    </Tabs>
  );
}
