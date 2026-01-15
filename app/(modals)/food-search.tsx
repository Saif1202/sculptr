import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import Fuse, { IFuseOptions } from 'fuse.js';
import { colors } from '../../src/theme';
import {
  listFavorites,
  listRecents,
  listUserFoods,
  createUserFood,
  type LibraryFood,
} from '../../src/lib/library';
import { searchOFF, type FoodItem } from '../../src/lib/food';
import { db } from '../../src/lib/firebase';

type TabKey = 'favorites' | 'recent' | 'custom' | 'search';

interface FoodSearchModalProps {
  visible: boolean;
  onClose: () => void;
  uid: string;
  onSelectFood: (food: FoodItem & { id?: string }) => void;
}

interface SearchState {
  query: string;
  loading: boolean;
  results: FoodItem[];
}

const fuseOptions: IFuseOptions<LibraryFood> = {
  keys: ['label', 'brand'],
  threshold: 0.35,
  ignoreLocation: true,
};

export function FoodSearchModal({ visible, onClose, uid, onSelectFood }: FoodSearchModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('favorites');
  const [favorites, setFavorites] = useState<LibraryFood[]>([]);
  const [recents, setRecents] = useState<LibraryFood[]>([]);
  const [customFoods, setCustomFoods] = useState<LibraryFood[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const [searchState, setSearchState] = useState<SearchState>({ query: '', loading: false, results: [] });
  const [customForm, setCustomForm] = useState({ label: '', brand: '', kcal: '', protein: '', carbs: '', fats: '', defaultServing: '' });
  const [creatingCustom, setCreatingCustom] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setActiveTab('favorites');
    setSearchState({ query: '', loading: false, results: [] });
    loadLibraryData();
  }, [visible]);

  const loadLibraryData = async () => {
    if (!uid) return;
    setLoadingLibrary(true);
    try {
      const [favs, recentList, customs] = await Promise.all([
        listFavorites(db, uid),
        listRecents(db, uid, 30),
        listUserFoods(db, uid, 100),
      ]);
      setFavorites(favs);
      setRecents(recentList);
      setCustomFoods(customs);
    } catch (error) {
      console.warn('Failed to load library data', error);
    } finally {
      setLoadingLibrary(false);
    }
  };

  const handleQueryChange = useCallback((text: string) => {
    setSearchState((prev) => ({ ...prev, query: text }));
  }, []);

  useEffect(() => {
    if (activeTab !== 'search') return;
    if (!searchState.query.trim()) {
      setSearchState((prev) => ({ ...prev, results: [] }));
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchState((prev) => ({ ...prev, loading: true }));
      const results = await searchOFF(searchState.query.trim(), 25);
      setSearchState((prev) => ({ ...prev, loading: false, results }));
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchState.query, activeTab]);

  const filterList = useCallback((items: LibraryFood[], query: string) => {
    if (!query.trim()) return items;
    const fuse = new Fuse(items, fuseOptions);
    return fuse.search(query.trim()).map((res) => res.item);
  }, []);

  const renderList = (items: LibraryFood[], emptyText: string) => {
    const filtered = filterList(items, searchState.query);
    if (!filtered.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{emptyText}</Text>
        </View>
      );
    }

    return filtered.map((item: LibraryFood) => (
      <TouchableOpacity
        key={item.id}
        style={styles.listItem}
        onPress={() => onSelectFood(item)}
      >
        <View style={styles.listInfo}>
          <Text style={styles.listLabel}>{item.label}</Text>
          {item.brand ? <Text style={styles.listBrand}>{item.brand}</Text> : null}
          <Text style={styles.listMacros}>
            {item.per100.kcal} kcal • {item.per100.proteinG}g P • {item.per100.carbsG}g C • {item.per100.fatsG}g F
          </Text>
        </View>
      </TouchableOpacity>
    ));
  };

  const handleCreateCustom = async () => {
    if (!uid) return;
    const trimmedLabel = customForm.label.trim();
    if (!trimmedLabel) {
      return;
    }

    setCreatingCustom(true);
    try {
      const per100 = {
        kcal: Math.round(Number(customForm.kcal) || 0),
        proteinG: Math.round(Number(customForm.protein) || 0),
        carbsG: Math.round(Number(customForm.carbs) || 0),
        fatsG: Math.round(Number(customForm.fats) || 0),
      };

      const newFood = await createUserFood(db, uid, {
        label: trimmedLabel,
        brand: customForm.brand.trim() || undefined,
        per100,
        defaultServingG: customForm.defaultServing ? Number(customForm.defaultServing) : undefined,
        source: 'user',
      });

      setCustomFoods((prev) => [newFood, ...prev]);
      setCustomForm({ label: '', brand: '', kcal: '', protein: '', carbs: '', fats: '', defaultServing: '' });
      onSelectFood(newFood);
    } catch (error) {
      console.warn('Failed to create custom food', error);
    } finally {
      setCreatingCustom(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'favorites', label: 'Favorites' },
    { key: 'recent', label: 'Recent' },
    { key: 'custom', label: 'Custom' },
    { key: 'search', label: 'Search' },
  ];

  const renderContent = () => {
    if (loadingLibrary && activeTab !== 'search') {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    switch (activeTab) {
      case 'favorites':
        return renderList(favorites, 'No favorites yet');
      case 'recent':
        return renderList(recents, 'No recent foods');
      case 'custom':
        return (
          <View>
            {renderList(customFoods, 'No custom foods')} 
            <View style={styles.customForm}>
              <Text style={styles.sectionHeader}>Create Custom Food</Text>
              <TextInput
                style={styles.input}
                placeholder="Label"
                placeholderTextColor={colors.textDim}
                value={customForm.label}
                onChangeText={(text) => setCustomForm((prev) => ({ ...prev, label: text }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.textDim}
                value={customForm.brand}
                onChangeText={(text) => setCustomForm((prev) => ({ ...prev, brand: text }))}
              />
              <View style={styles.macroRow}>
                <MacroField
                  label="kcal"
                  value={customForm.kcal}
                  onChange={(text) => setCustomForm((prev) => ({ ...prev, kcal: text }))}
                />
                <MacroField
                  label="Protein"
                  suffix="g"
                  value={customForm.protein}
                  onChange={(text) => setCustomForm((prev) => ({ ...prev, protein: text }))}
                />
              </View>
              <View style={styles.macroRow}>
                <MacroField
                  label="Carbs"
                  suffix="g"
                  value={customForm.carbs}
                  onChange={(text) => setCustomForm((prev) => ({ ...prev, carbs: text }))}
                />
                <MacroField
                  label="Fats"
                  suffix="g"
                  value={customForm.fats}
                  onChange={(text) => setCustomForm((prev) => ({ ...prev, fats: text }))}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Default serving (g)"
                placeholderTextColor={colors.textDim}
                value={customForm.defaultServing}
                onChangeText={(text) => setCustomForm((prev) => ({ ...prev, defaultServing: text }))}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.createButton, !customForm.label.trim() && styles.createButtonDisabled]}
                onPress={handleCreateCustom}
                disabled={!customForm.label.trim() || creatingCustom}
              >
                {creatingCustom ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.createButtonText}>Save Custom Food</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      case 'search':
        return (
          <View>
            {searchState.loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {!searchState.loading && !searchState.results.length ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>Search for foods powered by Open Food Facts.</Text>
              </View>
            ) : (
              searchState.results.map((item, index) => (
                <TouchableOpacity
                  key={`${item.barcode ?? item.label}-${index}`}
                  style={styles.listItem}
                  onPress={() => onSelectFood(item)}
                >
                  <View style={styles.listInfo}>
                    <Text style={styles.listLabel}>{item.label}</Text>
                    {item.brand ? <Text style={styles.listBrand}>{item.brand}</Text> : null}
                    <Text style={styles.listMacros}>
                      {item.per100.kcal} kcal • {item.per100.proteinG}g P • {item.per100.carbsG}g C • {item.per100.fatsG}g F
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      default:
        return null;
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Food Library</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'search' ? 'Search Open Food Facts…' : 'Filter foods'}
            placeholderTextColor={colors.textDim}
            value={searchState.query}
            onChangeText={handleQueryChange}
          />
        </View>

        <ScrollView style={styles.listContainer}>{renderContent()}</ScrollView>
      </View>
    </Modal>
  );
}

function MacroField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return (
    <View style={styles.macroField}>
      <Text style={styles.macroFieldLabel}>{label}</Text>
      <View style={styles.macroFieldInputWrapper}>
        <TextInput
          style={styles.macroFieldInput}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textDim}
        />
        {suffix && <Text style={styles.macroFieldSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeText: {
    color: colors.text,
    fontSize: 16,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  tabRow: {
    flexGrow: 0,
    paddingHorizontal: 12,
    marginTop: 20,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
  },
  tabButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
  },
  searchBar: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  listItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  listInfo: {
    flex: 1,
  },
  listLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  listBrand: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  listMacros: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    color: colors.textDim,
  },
  loadingContainer: {
    paddingVertical: 40,
  },
  customForm: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 20,
  },
  sectionHeader: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    marginBottom: 12,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroField: {
    flex: 1,
    marginRight: 12,
  },
  macroFieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 4,
  },
  macroFieldInputWrapper: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  macroFieldInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 8,
  },
  macroFieldSuffix: {
    color: colors.textDim,
    marginLeft: 4,
  },
  createButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
});

export default FoodSearchModal;

