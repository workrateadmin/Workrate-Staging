/**
 * Memphis Bold — native Badge component.
 * Lives in native/ — excluded from the web build, resolved by Metro.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

interface BadgeConfig { label: string; bg: string; text: string; }

function getConfig(status: string): BadgeConfig {
  const key = status.toLowerCase().replace(/[_\s-]/g, '');
  const map: Record<string, BadgeConfig> = {
    // Enquiry
    new:                    { label: 'New',                   bg: '#DBEAFE', text: '#1D4ED8' },
    reviewing:              { label: 'Reviewing',             bg: '#FEF9C3', text: '#854D0E' },
    surveyrequired:         { label: 'Survey Required',       bg: '#FEF3C7', text: '#92400E' },
    quotesent:              { label: 'Quote Sent',            bg: '#E0E7FF', text: '#4338CA' },
    won:                    { label: 'Won',                   bg: '#DCFCE7', text: '#15803D' },
    lost:                   { label: 'Lost',                  bg: '#FEE2E2', text: '#B91C1C' },
    // Job — canonical DB values (title-cased)
    surveybooked:           { label: 'Survey Booked',         bg: '#E0E7FF', text: '#4338CA' },
    installationscheduled:  { label: 'Installation Scheduled',bg: '#DBEAFE', text: '#1D4ED8' },
    inprogress:             { label: 'In Progress',           bg: '#FEF9C3', text: '#854D0E' },
    completed:              { label: 'Completed',             bg: '#DCFCE7', text: '#15803D' },
    complete:               { label: 'Completed',             bg: '#DCFCE7', text: '#15803D' },
    // Legacy fallbacks
    pending:                { label: 'Pending',               bg: '#F1F5F9', text: '#475569' },
    scheduled:              { label: 'Scheduled',             bg: '#E0E7FF', text: '#4338CA' },
    cancelled:              { label: 'Cancelled',             bg: '#FEE2E2', text: '#B91C1C' },
    canceled:               { label: 'Cancelled',             bg: '#FEE2E2', text: '#B91C1C' },
    // Quote
    draft:                  { label: 'Draft',                 bg: '#F1F5F9', text: '#475569' },
    sent:                   { label: 'Sent',                  bg: '#E0E7FF', text: '#4338CA' },
    accepted:               { label: 'Accepted',              bg: '#DCFCE7', text: '#15803D' },
    rejected:               { label: 'Rejected',              bg: '#FEE2E2', text: '#B91C1C' },
  };
  return map[key] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), bg: '#F1F5F9', text: '#475569' };
}

export function Badge({ status, size = 'md' }: BadgeProps) {
  const config = getConfig(status);
  const isSmall = size === 'sm';
  return (
    <View style={[st.badge, { backgroundColor: config.bg }, isSmall ? st.sm : st.md]}>
      <Text style={[st.text, { color: config.text }, isSmall ? st.textSm : st.textMd]}>
        {config.label}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  badge:   { borderRadius: 6, alignSelf: 'flex-start' as const },
  sm:      { paddingHorizontal: 7,  paddingVertical: 2 },
  md:      { paddingHorizontal: 10, paddingVertical: 4 },
  text:    { fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  textSm:  { fontSize: 11 },
  textMd:  { fontSize: 12 },
});
