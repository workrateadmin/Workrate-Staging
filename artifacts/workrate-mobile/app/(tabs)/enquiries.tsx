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
import { useListEnquiries, getListEnquiriesQueryKey } from '@workspace/api-client-react';

const FILTERS = [
  { label: 'All', value: undefined },
  { label: 'New', value: 'new' },
  { label: 'Reviewing', value: 'reviewing' },
  { label: 'Quote Sent', value: 'quote_sent' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function EnquiriesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const { data: enquiries, isLoading, refetch } = useListEnquiries(
    filter ? { status: filter } : undefined,
    { query: { queryKey: getListEnquiriesQueryKey(filter ? { status: filter } : undefined) } },
  );

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
        <Text style={[st.headerTitle, { color: colors.sidebarForeground }]}>Enquiries</Text>
        <Text style={[st.headerSub, { color: colors.sidebarForeground + '99' }]}>{enquiries?.length ?? 0} total</Text>
      </View>

      <View style={[st.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.label}
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
          data={enquiries ?? []}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: botPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(enquiries?.length)}
          ListEmptyComponent={
            <View style={[empSt.card, { borderColor: colors.border }]}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[empSt.title, { color: colors.mutedForeground }]}>No enquiries</Text>
              <Text style={[empSt.sub, { color: colors.mutedForeground }]}>
                {filter ? 'No enquiries match this filter.' : 'New leads will appear here.'}
              </Text>
            </View>
          }
          renderItem={({ item: enq }) => (
            <EnquiryRow colors={colors} enquiry={enq} onPress={() => router.push(`/enquiry/${enq.id}`)} />
          )}
        />
      )}
    </View>
  );
}

function EnquiryRow({ colors, enquiry, onPress }: { colors: Colors; enquiry: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[rowSt.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[rowSt.avatar, { backgroundColor: colors.primary + '22' }]}>
        <Text style={[rowSt.avatarText, { color: colors.primary }]}>
          {enquiry.customerName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[rowSt.name, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{enquiry.customerName}</Text>
          {enquiry.isTest && (
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#c2410c', backgroundColor: '#ffedd5', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' }}>
              TEST
            </Text>
          )}
        </View>
        {enquiry.projectType ? (
          <Text style={[rowSt.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{enquiry.projectType}</Text>
        ) : null}
        {enquiry.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text style={[rowSt.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{enquiry.location}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Badge status={enquiry.status} size="sm" />
        <Text style={[rowSt.time, { color: colors.mutedForeground }]}>{timeAgo(enquiry.createdAt)}</Text>
      </View>
    </TouchableOpacity>
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
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  time: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});

const empSt = StyleSheet.create({
  card: { marginTop: 40, alignItems: 'center', gap: 8, padding: 32, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' as const },
  title: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
