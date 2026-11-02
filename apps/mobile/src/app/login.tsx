import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { ui } from "@/lib/theme";

// The same login email as the website: the link is for the browser, the 6-digit code is for the app.
export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError("Enter a valid email address");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(error.message);
    setEmail(clean);
    setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(error.message);
    if (router.canGoBack()) router.back();
    if (next?.startsWith("/")) router.push(next as never);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ui.screen}>
      <View style={[ui.content, { maxWidth: 480, width: "100%", alignSelf: "center" }]}>
        <Text style={ui.h1}>Log in</Text>
        <Text style={ui.muted}>No password needed. We email you a 6-digit code.</Text>
        {error && <Text style={ui.error}>{error}</Text>}
        {!sent ? (
          <>
            <TextInput
              style={ui.input}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={sendCode}
              accessibilityLabel="Email"
            />
            <Button title="Email me a code" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <Text style={ui.text}>We sent a code to {email}. Enter it below.</Text>
            <TextInput
              style={[ui.input, { fontSize: 22, letterSpacing: 6, textAlign: "center" }]}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verify}
              accessibilityLabel="Login code"
            />
            <Button title="Log in" onPress={verify} loading={busy} disabled={code.trim().length !== 6} />
            <Button
              title="Use a different email"
              variant="outline"
              onPress={() => {
                setSent(false);
                setCode("");
              }}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
