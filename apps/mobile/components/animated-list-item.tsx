import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

interface AnimatedListItemProps {
  index: number
  children: React.ReactNode
}

export function AnimatedListItem({ index, children }: AnimatedListItemProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY, index])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  )
}
