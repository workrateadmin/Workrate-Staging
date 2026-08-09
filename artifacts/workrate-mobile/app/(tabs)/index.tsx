import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { Feather, Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useListJobs,
  getListJobsQueryKey,
} from '@workspace/api-client-react';

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function today() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const { data: dashboard, isLoading: dashLoading, refetch: refetchDash } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useListJobs({
    query: { queryKey: getListJobsQueryKey() },
  });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchDash(), refetchJobs()]);
    setRefreshing(false);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayJobs = (jobs ?? []).filter((j) => {
    const start = j.installationStartDate ?? j.installDate;
    return start && start.startsWith(todayStr);
  });

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + (Platform.OS !== 'web' ? 80 : 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.sidebar, paddingTop: topPad + 20 }]}>
        <View>
          <Text style={[st.headerDate, { color: colors.sidebarForeground + '99' }]}>{today()}</Text>
          <Text style={[st.headerTitle, { color: colors.sidebarForeground }]}>
            Hi{user?.firstName ? `, ${user.firstName}` : ''} 👷
          </Text>
        </View>
        <View style={[st.headerIcon, { backgroundColor: colors.primary + '22' }]}>
          <Ionicons name="construct" size={24} color={colors.primary} />
        </View>
      </View>

      <View style={st.body}>
        {/* Stats */}
        {dashLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <View style={st.statsRow}>
            <StatCard colors={colors} label="New Leads" value={String(dashboard?.newEnquiries ?? 0)} icon="inbox" accent={colors.primary} />
            <StatCard colors={colors} label="Active Jobs" value={String(dashboard?.won ?? 0)} icon="briefcase" accent={colors.secondary} />
            <StatCard colors={colors} label="Quote Value" value={formatCurrency(dashboard?.totalQuoteValue ?? 0)} icon="trending-up" accent={colors.accent} />
          </View>
        )}

        {/* Today's Schedule */}
        <Text style={[st.sectionTitle, { color: colors.foreground, marginTop: 24, marginBottom: 10 }]}>Today's Schedule</Text>
        {jobsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : todayJobs.length === 0 ? (
          <EmptyCard colors={colors} icon="calendar" message="No jobs scheduled for today" />
        ) : (
          todayJobs.map((job) => (
            <JobRow key={job.id} colors={colors} job={job} onPress={() => router.push(`/job/${job.id}`)} />
          ))
        )}

        {/* Recent Enquiries */}
        <View style={st.sectionHeaderRow}>
          <Text style={[st.sectionTitle, { color: colors.foreground }]}>Recent Enquiries</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/enquiries')}>
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>See all</Text>
          </TouchableOpacity>
        </View>

        {dashLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : (dashboard?.recentEnquiries ?? []).length === 0 ? (
          <EmptyCard colors={colors} icon="mail" message="No enquiries yet" />
        ) : (
          (dashboard?.recentEnquiries ?? []).slice(0, 5).map((enq) => (
            <EnquiryRow key={enq.id} colors={colors} enquiry={enq} onPress={() => router.push(`/enquiry/${enq.id}`)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ colors, label, value, icon, accent }: { colors: Colors; label: string; value: string; icon: string; accent: string }) {
  return (
    <View style={[stc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[stc.iconBox, { backgroundColor: accent + '1A' }]}>
        <Feather name={icon as any} size={18} color={accent} />
      </View>
      <Text style={[stc.value, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
      <Text style={[stc.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function EnquiryRow({ colors, enquiry, onPress }: { colors: Colors; enquiry: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[enqSt.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[enqSt.avatar, { backgroundColor: colors.primary + '22' }]}>
        <Text style={[enqSt.avatarText, { color: colors.primary }]}>
          {enquiry.customerName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[enqSt.name, { color: colors.foreground }]} numberOfLines={1}>{enquiry.customerName}</Text>
        {enquiry.projectType ? (
          <Text style={[enqSt.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{enquiry.projectType}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Badge status={enquiry.status} size="sm" />
        <Text style={[enqSt.time, { color: colors.mutedForeground }]}>{timeAgo(enquiry.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function JobRow({ colors, job, onPress }: { colors: Colors; job: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[enqSt.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[enqSt.avatar, { backgroundColor: colors.secondary + '22' }]}>
        <Feather name="briefcase" size={18} color={colors.secondary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[enqSt.name, { color: colors.foreground }]} numberOfLines={1}>{job.customerName}</Text>
        <Text style={[enqSt.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {job.projectType ?? job.location ?? 'Job'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Badge status={job.status} size="sm" />
      </View>
    </TouchableOpacity>
  );
}

function EmptyCard({ colors, icon, message }: { colors: Colors; icon: string; message: string }) {
  return (
    <View style={[empSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={24} color={colors.mutedForeground} />
      <Text style={[empSt.text, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerDate: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  headerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
});

const stc = StyleSheet.create({
  card: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 11, fontFamily: 'Inter_400Regular', fontWeight: '500' as const },
});

const enqSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  time: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});

const empSt = StyleSheet.create({
  card: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 8, marginBottom: 8 },
  text: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
