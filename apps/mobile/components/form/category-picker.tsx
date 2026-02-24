import { useState, useCallback, useMemo } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { TextInput, Menu, Text, ActivityIndicator } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useCategories } from '@/lib/hooks/use-categories'

interface CategoryPickerProps {
  value: string | null
  onChange: (category: string | null) => void
}

/**
 * Dropdown picker for expense categories.
 *
 * Fetches categories via `useCategories()` and renders a Paper Menu
 * anchored to a read-only TextInput. Each menu item shows a color dot
 * alongside the category name. A "No Category" option allows clearing
 * the selection.
 */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const [menuVisible, setMenuVisible] = useState(false)
  const { data, isLoading } = useCategories()

  const categories = useMemo(() => data?.data ?? [], [data])

  const selectedCategory = useMemo(
    () => categories.find((c) => c.categoryName === value),
    [categories, value],
  )

  const displayText = selectedCategory?.categoryName ?? ''
  const placeholder = isLoading ? 'Loading categories...' : 'Select category'

  const openMenu = useCallback(() => {
    if (!isLoading) setMenuVisible(true)
  }, [isLoading])

  const closeMenu = useCallback(() => setMenuVisible(false), [])

  const handleSelect = useCallback(
    (categoryName: string | null) => {
      onChange(categoryName)
      closeMenu()
    },
    [onChange, closeMenu],
  )

  return (
    <View>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Select category">
            <View pointerEvents="none">
              <TextInput
                label="Category"
                mode="outlined"
                value={displayText}
                placeholder={placeholder}
                editable={false}
                outlineColor="#D1D5DB"
                activeOutlineColor="#6366F1"
                outlineStyle={styles.outline}
                right={
                  isLoading ? (
                    <TextInput.Icon icon={() => <ActivityIndicator size={18} color="#6366F1" />} />
                  ) : (
                    <TextInput.Icon
                      icon={menuVisible ? 'chevron-up' : 'chevron-down'}
                      color="#6B7280"
                    />
                  )
                }
              />
            </View>
          </Pressable>
        }
        contentStyle={styles.menuContent}
        style={styles.menu}
      >
        <Menu.Item
          onPress={() => handleSelect(null)}
          title="No Category"
          leadingIcon={() => (
            <MaterialCommunityIcons name="close-circle-outline" size={18} color="#9CA3AF" />
          )}
          titleStyle={styles.noCategoryTitle}
        />

        {categories.map((category) => (
          <Menu.Item
            key={category.id}
            onPress={() => handleSelect(category.categoryName)}
            title={category.categoryName}
            leadingIcon={() => (
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: category.color || '#6366F1' },
                ]}
              />
            )}
            titleStyle={[
              styles.menuItemTitle,
              value === category.categoryName && styles.menuItemTitleSelected,
            ]}
          />
        ))}

        {categories.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text variant="bodySmall" style={styles.emptyText}>
              No categories found
            </Text>
          </View>
        )}
      </Menu>
    </View>
  )
}

const styles = StyleSheet.create({
  outline: {
    borderRadius: 12,
  },
  menu: {
    marginTop: 4,
  },
  menuContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  noCategoryTitle: {
    color: '#9CA3AF',
  },
  menuItemTitle: {
    color: '#374151',
  },
  menuItemTitleSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  emptyContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
  },
})
