import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useColors } from '@workspace/memphis-bold/hooks/use-colors';
import type { Colors } from '@workspace/memphis-bold/hooks/use-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');

  const isLoading = fetchStatus === 'fetching';

  const finalize = async () => {
    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl('/');
        if (typeof window !== 'undefined' && url.startsWith('http')) {
          window.location.href = url;
        } else {
          router.replace('/');
        }
      },
    });
  };

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;
    if (signIn.status === 'complete') await finalize();
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: verifyCode });
    if (signIn.status === 'complete') await finalize();
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0);

  if (signIn.status === 'needs_client_trust') {
    return (
      <View style={[s(colors).container, { paddingTop: topPad + 40, paddingBottom: botPad + 40 }]}>
        <View style={s(colors).card}>
          <Ionicons name="mail" size={36} color={colors.primary} style={{ alignSelf: 'center', marginBottom: 8 }} />
          <Text style={s(colors).title}>Check your email</Text>
          <Text style={s(colors).subtitle}>Enter the verification code we sent you</Text>
          <TextInput
            style={s(colors).input}
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            autoFocus
          />
          {errors?.fields?.code && (
            <Text style={s(colors).errorText}>{errors.fields.code.message}</Text>
          )}
          <TouchableOpacity
            style={[s(colors).primaryButton, isLoading && s(colors).disabled]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={s(colors).primaryButtonText}>Verify</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signIn.mfa.sendEmailCode()}>
            <Text style={[s(colors).linkText, { textAlign: 'center' }]}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        s(colors).scrollContent,
        { paddingTop: topPad + 32, paddingBottom: botPad + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s(colors).header}>
        <View style={s(colors).logoCircle}>
          <Ionicons name="construct" size={32} color={colors.primary} />
        </View>
        <Text style={s(colors).appName}>WorkRate</Text>
        <Text style={s(colors).tagline}>Trade job management, in your pocket</Text>
      </View>

      <View style={s(colors).form}>
        <View style={s(colors).inputGroup}>
          <Text style={s(colors).label}>Email address</Text>
          <TextInput
            style={s(colors).input}
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="email-input"
          />
          {errors?.fields?.identifier && (
            <Text style={s(colors).errorText}>{errors.fields.identifier.message}</Text>
          )}
        </View>

        <View style={s(colors).inputGroup}>
          <Text style={s(colors).label}>Password</Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              style={s(colors).input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              testID="password-input"
            />
            <TouchableOpacity
              style={s(colors).eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
          {errors?.fields?.password && (
            <Text style={s(colors).errorText}>{errors.fields.password.message}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            s(colors).primaryButton,
            (!emailAddress || !password || isLoading) && s(colors).disabled,
          ]}
          onPress={handleSignIn}
          disabled={!emailAddress || !password || isLoading}
          testID="sign-in-button"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s(colors).primaryButtonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <View style={s(colors).footerRow}>
          <Text style={s(colors).footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={s(colors).linkText}>Sign up</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const s = (colors: Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    header: { alignItems: 'center', marginBottom: 40 },
    logoCircle: {
      width: 80,
      height: 80,
      borderRadius: colors.radius + 12,
      backgroundColor: colors.sidebar,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    appName: {
      fontSize: 28,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      marginBottom: 6,
    },
    tagline: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
    form: { gap: 18 },
    inputGroup: { gap: 6 },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    input: {
      height: 50,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingRight: 48,
      fontSize: 15,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontFamily: 'Inter_400Regular',
    },
    eyeButton: {
      position: 'absolute',
      right: 14,
      height: 50,
      justifyContent: 'center',
    },
    primaryButton: {
      height: 52,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.primaryForeground,
      fontFamily: 'Inter_600SemiBold',
    },
    disabled: { opacity: 0.45 },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    linkText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600' as const,
      fontFamily: 'Inter_600SemiBold',
    },
    errorText: {
      fontSize: 12,
      color: colors.destructive,
      fontFamily: 'Inter_400Regular',
    },
  });
