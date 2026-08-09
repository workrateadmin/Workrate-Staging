import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@workspace/memphis-bold/hooks/use-colors';
import type { Colors } from '@workspace/memphis-bold/hooks/use-colors';
import { Badge } from '@workspace/memphis-bold/components/native/badge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useGetEnquiry,
  getGetEnquiryQueryKey,
  useGetQuote,
  getGetQuoteQueryKey,
  useUpdateQuote,
  useUpdateEnquiry,
  useConvertEnquiryToJob,
  getListEnquiriesQueryKey,
  getGetDashboardQueryKey,
  getListJobsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ENQUIRY_STATUSES = ['new', 'reviewing', 'survey_required', 'quote_sent', 'won', 'lost'];

export default function EnquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [converting, setConverting] = useState(false);
  // Tracks whether the quote was accepted but job creation failed, so we can offer a retry
  const [quoteAccepted, setQuoteAccepted] = useState(false);

  const { data: enquiry, isLoading: enquiryLoading } = useGetEnquiry(numId, {
    query: { queryKey: getGetEnquiryQueryKey(numId) },
  });

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useGetQuote(numId, {
    query: { queryKey: getGetQuoteQueryKey(numId), retry: false },
  });

  const updateEnquiryMutation = useUpdateEnquiry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEnquiryQueryKey(numId) });
        queryClient.invalidateQueries({ queryKey: getListEnquiriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    },
  });

  const convertToJobMutation = useConvertEnquiryToJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEnquiryQueryKey(numId) });
      },
    },
  });

  const updateQuoteMutation = useUpdateQuote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(numId) });
        queryClient.invalidateQueries({ queryKey: getGetEnquiryQueryKey(numId) });
      },
    },
  });

  const handleStatusChange = (newStatus: string) => {
    if (!enquiry) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateEnquiryMutation.mutate({ id: numId, data: { status: newStatus } });
  };

  const handleApproveQuote = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConverting(true);
    try {
      // Step 1: Accept the quote (idempotent if already accepted)
      if (quote?.status !== 'accepted') {
        await updateQuoteMutation.mutateAsync({ id: numId, data: { status: 'accepted' } });
      }
      setQuoteAccepted(true);
      // Step 2: Convert the enquiry to a job.
      // If this fails the user can retry via the dedicated retry button below.
      await convertToJobMutation.mutateAsync({ id: numId });
    } catch {
      // Conversion errors are surfaced via convertToJobMutation.isError — a retry button appears below.
    } finally {
      setConverting(false);
    }
  };

  /** Called when the user taps "Retry job creation" after a failed conversion. */
  const handleRetryConversion = async () => {
    setConverting(true);
    try {
      await convertToJobMutation.mutateAsync({ id: numId });
    } catch {
      // Error surfaced via mutation state
    } finally {
      setConverting(false);
    }
  };

  const handleRejectQuote = () => {
    Alert.alert('Reject Quote', 'Are you sure you want to reject this quote?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          updateQuoteMutation.mutate({ id: numId, data: { status: 'rejected' } });
        },
      },
    ]);
  };

  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24;
  const isApprovePending = converting || updateQuoteMutation.isPending || convertToJobMutation.isPending;

  if (enquiryLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!enquiry) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: 'Inter_400Regular', fontSize: 15 }}>
          Enquiry not found
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[heroSt.hero, { backgroundColor: colors.sidebar }]}>
        <View style={heroSt.avatarRow}>
          <View style={[heroSt.avatar, { backgroundColor: colors.primary + '33' }]}>
            <Text style={[heroSt.avatarText, { color: colors.sidebarAccentForeground }]}>
              {enquiry.customerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {enquiry.isTest && (
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#c2410c', backgroundColor: '#ffedd5', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, overflow: 'hidden', alignSelf: 'flex-start', marginBottom: 4, letterSpacing: 1 }}>
                TEST DATA
              </Text>
            )}
            <Text style={[heroSt.name, { color: colors.sidebarForeground }]}>{enquiry.customerName}</Text>
            {enquiry.createdAt && (
              <Text style={[heroSt.date, { color: colors.sidebarForeground + '88' }]}>
                Received {formatDate(enquiry.createdAt)}
              </Text>
            )}
          </View>
          <Badge status={enquiry.status} size="md" />
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 14 }}>
        {/* Contact */}
        <InfoCard colors={colors} title="Contact">
          {enquiry.customerEmail ? <InfoRow colors={colors} icon="mail" label="Email" value={enquiry.customerEmail} /> : null}
          {enquiry.customerPhone ? <InfoRow colors={colors} icon="phone" label="Phone" value={enquiry.customerPhone} /> : null}
          {enquiry.location ? <InfoRow colors={colors} icon="map-pin" label="Location" value={enquiry.location} /> : null}
        </InfoCard>

        {/* Project */}
        <InfoCard colors={colors} title="Project">
          {enquiry.projectType ? <InfoRow colors={colors} icon="tool" label="Type" value={enquiry.projectType} /> : null}
          {enquiry.budget ? <InfoRow colors={colors} icon="dollar-sign" label="Budget" value={enquiry.budget} /> : null}
          {enquiry.timescale ? <InfoRow colors={colors} icon="clock" label="Timescale" value={enquiry.timescale} /> : null}
          {enquiry.description ? (
            <View style={{ gap: 4, paddingTop: 4 }}>
              <Text style={[detSt.label, { color: colors.mutedForeground }]}>Description</Text>
              <Text style={[detSt.value, { color: colors.foreground }]}>{enquiry.description}</Text>
            </View>
          ) : null}
        </InfoCard>

        {enquiry.aiSummary ? (
          <InfoCard colors={colors} title="AI Summary">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="sparkles" size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={[detSt.value, { color: colors.foreground, flex: 1 }]}>{enquiry.aiSummary}</Text>
            </View>
          </InfoCard>
        ) : null}

        {/* Status update */}
        <InfoCard colors={colors} title="Update Status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ENQUIRY_STATUSES.map((s) => {
              const active = enquiry.status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[stBtn.btn, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => handleStatusChange(s)}
                  disabled={active || updateEnquiryMutation.isPending}
                >
                  {updateEnquiryMutation.isPending && active ? (
                    <ActivityIndicator size={12} color={colors.primaryForeground} />
                  ) : (
                    <Text style={[stBtn.text, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </InfoCard>

        {/* Quote */}
        <View style={[qSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={qSt.header}>
            <Text style={[qSt.title, { color: colors.foreground }]}>Quote</Text>
            {quote && <Badge status={quote.status} size="sm" />}
          </View>

          {quoteLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !quote || (quoteError as any)?.status === 404 ? (
            <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
              <Feather name="file-text" size={28} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                No quote generated yet
              </Text>
            </View>
          ) : (
            <>
              {quote.projectDescription ? (
                <Text style={[qSt.desc, { color: colors.mutedForeground }]}>{quote.projectDescription}</Text>
              ) : null}
              <View style={qSt.lineItems}>
                <QuoteLine colors={colors} label="Materials" value={formatCurrency(quote.materialsAllowance)} />
                <QuoteLine colors={colors} label="Labour" value={formatCurrency(quote.labourAllowance)} />
                <View style={[qSt.divider, { backgroundColor: colors.border }]} />
                <QuoteLine colors={colors} label="Subtotal" value={formatCurrency(quote.estimatedTotal)} />
                <QuoteLine colors={colors} label="VAT" value={formatCurrency(quote.vatAmount)} />
                <QuoteLine colors={colors} label="Total" value={formatCurrency(quote.totalWithVat)} bold />
              </View>

              {/* Approve/reject controls — visible when quote is pending */}
              {(quote.status === 'draft' || quote.status === 'sent') && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[qSt.rejectBtn, { borderColor: colors.destructive }]}
                    onPress={handleRejectQuote}
                    disabled={isApprovePending}
                  >
                    <Feather name="x" size={16} color={colors.destructive} />
                    <Text style={[qSt.rejectBtnText, { color: colors.destructive }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[qSt.approveBtn, { backgroundColor: colors.primary, flex: 1 }]}
                    onPress={handleApproveQuote}
                    disabled={isApprovePending}
                  >
                    {isApprovePending ? (
                      <ActivityIndicator color={colors.primaryForeground} size={16} />
                    ) : (
                      <>
                        <Feather name="check" size={16} color={colors.primaryForeground} />
                        <Text style={[qSt.approveBtnText, { color: colors.primaryForeground }]}>
                          Approve & Convert to Job
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Job creation succeeded */}
              {convertToJobMutation.isSuccess && (
                <View style={[qSt.acceptedBanner, { backgroundColor: '#DCFCE7' }]}>
                  <Feather name="check-circle" size={16} color="#15803D" />
                  <Text style={{ color: '#15803D', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Quote approved — job created successfully
                  </Text>
                </View>
              )}

              {/* Quote accepted but job conversion failed — show explicit retry */}
              {(quoteAccepted || quote.status === 'accepted') && convertToJobMutation.isError && !convertToJobMutation.isSuccess && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={[qSt.acceptedBanner, { backgroundColor: '#FEF9C3' }]}>
                    <Feather name="alert-triangle" size={16} color="#854D0E" />
                    <Text style={{ color: '#854D0E', fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }}>
                      Quote accepted, but job creation failed. Tap below to retry.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[qSt.approveBtn, { backgroundColor: colors.secondary }]}
                    onPress={handleRetryConversion}
                    disabled={converting}
                  >
                    {converting ? (
                      <ActivityIndicator color={colors.secondaryForeground} size={16} />
                    ) : (
                      <>
                        <Feather name="refresh-cw" size={16} color={colors.secondaryForeground} />
                        <Text style={[qSt.approveBtnText, { color: colors.secondaryForeground }]}>
                          Retry Job Creation
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Quote accepted, conversion not yet attempted (fresh load) */}
              {quote.status === 'accepted' && !convertToJobMutation.isError && !convertToJobMutation.isSuccess && !quoteAccepted && (
                <View style={[qSt.acceptedBanner, { backgroundColor: '#DCFCE7' }]}>
                  <Feather name="check-circle" size={16} color="#15803D" />
                  <Text style={{ color: '#15803D', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Quote approved
                  </Text>
                </View>
              )}

              {quote.status === 'rejected' && (
                <View style={[qSt.acceptedBanner, { backgroundColor: '#FEE2E2' }]}>
                  <Feather name="x-circle" size={16} color="#B91C1C" />
                  <Text style={{ color: '#B91C1C', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Quote rejected
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function InfoCard({ colors, title, children }: { colors: Colors; title: string; children: React.ReactNode }) {
  return (
    <View style={[iCard.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[iCard.title, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function InfoRow({ colors, icon, label, value }: { colors: Colors; icon: string; label: string; value: string }) {
  return (
    <View style={iRow.row}>
      <Feather name={icon as any} size={14} color={colors.mutedForeground} style={iRow.icon} />
      <Text style={[iRow.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[iRow.value, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function QuoteLine({ colors, label, value, bold }: { colors: Colors; label: string; value: string; bold?: boolean }) {
  return (
    <View style={qSt.quoteLine}>
      <Text style={[qSt.qLabel, { color: colors.mutedForeground, fontWeight: bold ? '700' : '400' }]}>{label}</Text>
      <Text style={[qSt.qValue, { color: colors.foreground, fontWeight: bold ? '700' : '500' }]}>{value}</Text>
    </View>
  );
}

const heroSt = StyleSheet.create({
  hero: { padding: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  date: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});

const iCard = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  title: { fontSize: 11, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
});

const iRow = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 2, width: 16 },
  label: { fontSize: 13, fontFamily: 'Inter_400Regular', width: 72, marginTop: 1 },
  value: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
});

const detSt = StyleSheet.create({
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', fontWeight: '700' as const, letterSpacing: 0.5 },
  value: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});

const stBtn = StyleSheet.create({
  btn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12, fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
});

const qSt = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  desc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  lineItems: { gap: 10 },
  quoteLine: { flexDirection: 'row', justifyContent: 'space-between' },
  qLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  qValue: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  divider: { height: 1, marginVertical: 2 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 10 },
  approveBtnText: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  rejectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 16 },
  rejectBtnText: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  acceptedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginTop: 4 },
});
