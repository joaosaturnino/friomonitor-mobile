import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        // ESCONDER A BARRA DO EXPO (Vamos usar a nossa própria BottomBar no index.tsx)
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "TermoSync" }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
