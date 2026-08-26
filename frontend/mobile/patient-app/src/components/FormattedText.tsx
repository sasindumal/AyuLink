// ==============================================
// AyuLink Patient - Formatted Text
// Renders LLM chat output as real markdown (bold,
// italic, lists, headings, code, links, …) instead of
// showing the raw ** / # / - syntax as literal text.
// ==============================================

import React, { useMemo } from "react";
import { StyleSheet, TextStyle } from "react-native";
import Markdown from "react-native-markdown-display";
import { colors, radius, spacing } from "../theme";

export function FormattedText({ text, style }: { text: string; style?: TextStyle | TextStyle[] }) {
    const flat = StyleSheet.flatten(style) ?? {};
    const textColor = flat.color ?? colors.text;
    const fontSize = flat.fontSize ?? 14.5;
    const lineHeight = flat.lineHeight ?? 20;

    const markdownStyles = useMemo(
        () =>
            StyleSheet.create({
                body: { color: textColor, fontSize, lineHeight },
                paragraph: { marginTop: 0, marginBottom: 0 },
                strong: { fontWeight: "800" },
                em: { fontStyle: "italic" },
                heading1: { fontSize: fontSize + 5, fontWeight: "800", color: textColor, marginTop: 4, marginBottom: 4 },
                heading2: { fontSize: fontSize + 3, fontWeight: "800", color: textColor, marginTop: 4, marginBottom: 4 },
                heading3: { fontSize: fontSize + 1.5, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 2 },
                heading4: { fontSize: fontSize + 0.5, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 2 },
                heading5: { fontSize, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 2 },
                heading6: { fontSize, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 2 },
                bullet_list: { marginTop: 2, marginBottom: 2 },
                ordered_list: { marginTop: 2, marginBottom: 2 },
                list_item: { flexDirection: "row", marginTop: 2 },
                bullet_list_icon: { color: textColor, marginRight: 6 },
                bullet_list_content: { flex: 1, color: textColor, fontSize, lineHeight },
                ordered_list_icon: { color: textColor, marginRight: 6 },
                ordered_list_content: { flex: 1, color: textColor, fontSize, lineHeight },
                code_inline: {
                    backgroundColor: colors.primarySoft,
                    color: colors.primaryDark,
                    borderRadius: 4,
                    paddingHorizontal: 4,
                    fontSize: fontSize - 1,
                },
                code_block: {
                    backgroundColor: colors.primarySoft,
                    borderRadius: radius.sm,
                    padding: spacing.sm,
                    fontSize: fontSize - 1,
                },
                fence: {
                    backgroundColor: colors.primarySoft,
                    borderRadius: radius.sm,
                    padding: spacing.sm,
                    fontSize: fontSize - 1,
                },
                blockquote: {
                    backgroundColor: "transparent",
                    borderLeftWidth: 3,
                    borderLeftColor: colors.border,
                    paddingLeft: spacing.sm,
                    marginVertical: 2,
                },
                hr: { backgroundColor: colors.border, marginVertical: spacing.sm },
                link: { color: colors.primaryDark, textDecorationLine: "underline" },
                table: { borderColor: colors.border, marginVertical: 4 },
                th: { padding: 6, color: textColor, fontWeight: "700" },
                tr: { borderBottomColor: colors.border },
                td: { padding: 6, color: textColor },
            }),
        [textColor, fontSize, lineHeight]
    );

    return <Markdown style={markdownStyles}>{text}</Markdown>;
}
