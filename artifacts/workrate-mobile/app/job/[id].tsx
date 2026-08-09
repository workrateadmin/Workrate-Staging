import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@workspace/memphis-bold/hooks/use-colors';
import type { Colors } from '@workspace/memphis-bold/hooks/use-colors';
import { Badge } from '@workspace/memphis-bold/components/native/badge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useGetJob,
  getGetJobQueryKey,
  useUpdateJob,
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

// Canonical job statuses as stored in the database
const JOB_STATUSES = [
  'Survey Required',
  'Survey Booked',
  'Installation Scheduled',
  'In Progress',
  'Completed',
] as const;

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useGetJob(numId, {
    query: { queryKey: getGetJobQueryKey(numId) },
  });

  const updateJobMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(numId) });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      },
    },
  });

  const handleStatusChange = (newStatus: string) => {
    if (!job) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateJobMutation.mutate({ id: numId, data: { status: newStatus } });
  };

  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: 'Inter_400Regular', fontSize: 15 }}>
          Job not found
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
        <View style={heroSt.row}>
          <View style={[heroSt.iconBox, { backgroundColor: colors.secondary + '22' }]}>
            <Feather name="briefcase" size={24} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[heroSt.name, { color: colors.sidebarForeground }]}>{job.customerName}</Text>
            {job.projectType ? (
              <Text style={[heroSt.sub, { color: colors.sidebarForeground + '88' }]}>{job.projectType}</Text>
            ) : null}
          </View>
          <Badge status={job.status} size="md" />
        </View>

        <View style={[heroSt.valueStrip, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
          <View style={heroSt.valueItem}>
            <Text style={[heroSt.valueLabel, { color: colors.sidebarForeground + '88' }]}>Materials</Text>
            <Text style={[heroSt.valueNum, { color: colors.sidebarForeground }]}>{formatCurrency(job.materialsAllowance)}</Text>
          </View>
          <View style={[heroSt.separator, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
          <View style={heroSt.valueItem}>
            <Text style={[heroSt.valueLabel, { color: colors.sidebarForeground + '88' }]}>Labour</Text>
            <Text style={[heroSt.valueNum, { color: colors.sidebarForeground }]}>{formatCurrency(job.labourAllowance)}</Text>
          </View>
          <View style={[heroSt.separator, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
          <View style={heroSt.valueItem}>
            <Text style={[heroSt.valueLabel, { color: colors.sidebarForeground + '88' }]}>Total (inc. VAT)</Text>
            <Text style={[heroSt.valueNum, { color: colors.secondary }]}>{formatCurrency(job.totalWithVat)}</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 14 }}>
        <InfoCard colors={colors} title="Customer">
          {job.customerEmail ? <InfoRow colors={colors} icon="mail" label="Email" value={job.customerEmail} /> : null}
          {job.customerPhone ? <InfoRow colors={colors} icon="phone" label="Phone" value={job.customerPhone} /> : null}
          {job.location ? <InfoRow colors={colors} icon="map-pin" label="Location" value={job.location} /> : null}
        </InfoCard>

        <InfoCard colors={colors} title="Schedule">
          <InfoRow colors={colors} icon="clipboard" label="Survey" value={formatDate(job.siteSurveyDate)} />
          <InfoRow colors={colors} icon="calendar" label="Start" value={formatDate(job.installationStartDate ?? job.installDate)} />
          <InfoRow colors={colors} icon="calendar" label="End" value={formatDate(job.installationEndDate)} />
          {job.assignedTeam ? <InfoRow colors={colors} icon="users" label="Team" value={job.assignedTeam} /> : null}
        </InfoCard>

        {job.projectDescription ? (
          <InfoCard colors={colors} title="Description">
            <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
              {job.projectDescription}
            </Text>
          </InfoCard>
        ) : null}

        {job.aiSummary ? (
          <InfoCard colors={colors} title="AI Summary">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Feather name="zap" size={15} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: 'Inter_400Regular', lineHeight: 20, flex: 1 }}>
                {job.aiSummary}
              </Text>
            </View>
          </InfoCard>
        ) : null}

        {job.notes ? (
          <InfoCard colors={colors} title="Notes">
            <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
              {job.notes}
            </Text>
          </InfoCard>
        ) : null}

        <InfoCard colors={colors} title="Update Status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {JOB_STATUSES.map((s) => {
              const active = job.status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[stBtn.btn, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => handleStatusChange(s)}
                  disabled={active || updateJobMutation.isPending}
                >
                  {updateJobMutation.isPending && active ? (
                    <ActivityIndicator size={12} color={colors.primaryForeground} />
                  ) : (
                    <Text style={[stBtn.text, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {s}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </InfoCard>
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

const heroSt = StyleSheet.create({
  hero: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  iconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  valueStrip: { flexDirection: 'row', borderRadius: 12, padding: 14 },
  valueItem: { flex: 1, alignItems: 'center', gap: 4 },
  valueLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  valueNum: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  separator: { width: 1 },
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

const stBtn = StyleSheet.create({
  btn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12, fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
});
