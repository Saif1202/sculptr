import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../src/theme';
import type { ExerciseRecord } from '../../src/lib/training';

interface ExerciseViewProps {
  visible: boolean;
  onClose: () => void;
  exercise: (ExerciseRecord & { id?: string }) | null;
  onAddToWorkout?: (exercise: ExerciseRecord & { id?: string }) => void;
  onStartSingle?: (exercise: ExerciseRecord & { id?: string }) => void;
}

export default function ExerciseViewModal({
  visible,
  onClose,
  exercise,
  onAddToWorkout,
  onStartSingle,
}: ExerciseViewProps) {
  if (!visible || !exercise) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{exercise.name}</Text>
          <Text style={styles.subtitle}>{exercise.movement} · {exercise.equipment}</Text>
          <Text style={styles.subinfo}>{exercise.muscles.join(' • ')}</Text>

          {exercise.instructions ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Instructions</Text>
              <Text style={styles.sectionBody}>{exercise.instructions}</Text>
            </View>
          ) : null}

          {exercise.cues && exercise.cues.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cues</Text>
              {exercise.cues.map((cue) => (
                <Text key={cue} style={styles.cueText}>• {cue}</Text>
              ))}
            </View>
          ) : null}

          {exercise.demoUrl ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Demo</Text>
              <Text style={styles.demoText}>{exercise.demoUrl}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onClose}>
            <Text style={styles.secondaryText}>Close</Text>
          </TouchableOpacity>
          {onAddToWorkout ? (
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={() => onAddToWorkout && onAddToWorkout(exercise)}
            >
              <Text style={styles.primaryText}>Add to Workout</Text>
            </TouchableOpacity>
          ) : null}
          {onStartSingle ? (
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={() => onStartSingle && onStartSingle(exercise)}
            >
              <Text style={styles.primaryText}>Start Exercise</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 24,
    paddingTop: 140,
    paddingBottom: 120,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 16,
  },
  subinfo: {
    color: colors.textDim,
    marginTop: 4,
    fontSize: 14,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionBody: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
  },
  cueText: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 4,
  },
  demoText: {
    color: colors.accent,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryText: {
    color: colors.text,
    fontWeight: '600',
  },
});

