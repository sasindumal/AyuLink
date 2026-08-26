import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/lib/auth";
import { colors } from "../src/theme";

export default function Index() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.background,
                }}
            >
                <ActivityIndicator size="large" color={colors.primaryDark} />
            </View>
        );
    }

    return <Redirect href={user ? "/(tabs)/home" : "/login"} />;
}
