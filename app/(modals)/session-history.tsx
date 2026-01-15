import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '../../src/theme';

export interface SessionHistoryItem {
  id: string;
  workoutName: string;
  dateISO: string;
  startedAt?: Date | null;
  setsCount: number;
  volume: number;
  durationSec?: number | null;
  est1RM?: Record<string, number>;
}

interface SessionHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  sessions: SessionHistoryItem[];
  loading?: boolean;
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return `${seconds}s`;
  const remainder = seconds % 60;
  return remainder ? `${mins}m ${remainder}s` : `${mins}m`;
}

export default function SessionHistoryModal({ visible, onClose, sessions, loading }: SessionHistoryModalProps) {
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Session History</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {sessions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No sessions logged yet.</Text>
              </View>
            ) : (
              sessions.map((session) => {
                const duration = formatDuration(session.durationSec ?? null);
                const topLift = session.est1RM
                  ? Object.entries(session.est1RM)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]
                  : undefined;
                return (
                  <View key={session.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{session.workoutName}</Text>
                        <Text style={styles.cardSubtitle}>{session.dateISO}</Text>
                      </View>
                      {duration ? <Text style={styles.duration}>{duration}</Text> : null}
                    </View>
                    <View style={styles.row}>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{session.setsCount}</Text>
                        <Text style={styles.statLabel}>Sets</Text>
                      </View>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{session.volume}</Text>
                        <Text style={styles.statLabel}>Volume</Text>
                      </View>
                      {topLift ? (
                        <View style={[styles.stat, { flex: 1.6 }]}>
                          <Text style={styles.statValueSm}>{topLift[1]}</Text>
                          <Text style={styles.statLabel}>Best 1RM · {topLift[0]}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  duration: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statValueSm: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
});
