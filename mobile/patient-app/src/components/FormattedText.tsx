// ==============================================
// AyuLink Patient - Formatted Text
// Renders **bold** markdown segments from LLM chat
// output as actual bold text instead of literal asterisks.
// ==============================================

import React from "react";
import { Text, TextStyle } from "react-native";

export function FormattedText({ text, style }: { text: string; style?: TextStyle | TextStyle[] }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
    return (
        <Text style={style}>
            {parts.map((part, i) => {
                const isBold = part.startsWith("**") && part.endsWith("**");
                return (
                    <Text key={i} style={isBold ? { fontWeight: "800" } : undefined}>
                        {isBold ? part.slice(2, -2) : part}
                    </Text>
                );
            })}
        </Text>
    );
}
