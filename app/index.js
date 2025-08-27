import React from "react";
import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8 }}>
        Find My Car 🚗
      </Text>
      <Text>Expo Router is working. This is the home screen.</Text>
    </View>
  );
}
