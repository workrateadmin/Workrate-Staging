import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useColors } from '@workspace/memphis-bold/hooks/use-colors';
import type { Colors } from '@workspace/memphis-bold/hooks/use-colors';
import { Badge } from '@workspace/memphis-bold/components/native/badge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useListJobs, getListJobsQueryKey } from '@workspace/api-client-react';

// Canonical job statuses as stored in the database
const FILTERS = [
  { label: 'All',                   value: 'all' },
  { label: 'Survey Required',       value: 'Survey Required' },
  { label: 'Survey Booked',         value: 'Survey Booked' },
  { label: 'Scheduled',             value: 'Installation Scheduled' },
  { label: 'In Progress',           value: 'In Progress' },
  { label: 'Completed',             value: 'Completed' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JobsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState('all');

  const { data: allJobs, isLoading, refetch } = useListJobs({
    query: { queryKey: getListJobsQueryKey() },
  });

  const jobs = filter === 'all'
    ? (allJobs ?? [])
    : (allJobs ?? []).filter((j) => j.status === filter);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + (Platform.OS !== 'web' ? 80 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[st.header, { backgroundColor: colors.sidebar, paddingTop: topPad + 16 }]}>
        <Text style={[st.headerTitle, { color: colors.sidebarForeground }]}>Jobs</Text>
        <Text style={[st.headerSub, { color: colors.sidebarForeground + '99' }]}>
          {jobs.length} {filter === 'all' ? 'total' : FILTERS.find(f => f.value === filter)?.label ?? filter}
        </Text>
      </View>

      <View style={[st.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = filter === item.value;
            return (
              <TouchableOpacity
                style={[st.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => setFilter(item.value)}
              >
                <Text style={[st.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: botPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={jobs.length > 0}
          ListEmptyComponent={
            <View style={[empSt.card, { borderColor: colors.border }]}>
              <Feather name="briefcase" size={32} color={colors.mutedForeground} />
              <Text style={[empSt.title, { color: colors.mutedForeground }]}>No jobs</Text>
              <Text style={[empSt.sub, { color: colors.mutedForeground }]}>
                {filter !== 'all' ? 'No jobs match this filter.' : 'Jobs will appear here when quotes are won.'}
              </Text>
            </View>
          }
          renderItem={({ item: job }) => {
            const scheduledDate = job.installationStartDate ?? job.installDate ?? job.siteSurveyDate;
            return (
              <TouchableOpacity
                style={[rowSt.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/job/${job.id}`)}
                activeOpacity={0.7}
              >
                <View style={[rowSt.iconBox, { backgroundColor: colors.secondary + '22' }]}>
                  <Feather name="briefcase" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[rowSt.name, { color: colors.foreground }]} numberOfLines={1}>{job.customerName}</Text>
                  {job.projectType ? (
                    <Text style={[rowSt.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{job.projectType}</Text>
                  ) : null}
                  {scheduledDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Feather name="calendar" size={11} color={colors.mutedForeground} />
                      <Text style={[rowSt.sub, { color: colors.mutedForeground }]}>{formatDate(scheduledDate)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge status={job.status} size="sm" />
                  <Text style={[rowSt.value, { color: colors.foreground }]}>{formatCurrency(job.totalWithVat)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  filterBar: { borderBottomWidth: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});

const rowSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  value: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});

const empSt = StyleSheet.create({
  card: { marginTop: 40, alignItems: 'center', gap: 8, padding: 32, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' as const },
  title: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
