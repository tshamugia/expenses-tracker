'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Camera, X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AvatarUploadProps {
  currentImage?: string | null
  onImageChange: (imageUrl: string) => void
  onImageDelete: () => void
  className?: string
}

export function AvatarUpload({
  currentImage,
  onImageChange,
  onImageDelete,
  className,
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImage || null)
  const [isHovering, setIsHovering] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      setPreview(result)
      onImageChange(result)
    }
    reader.readAsDataURL(file)
  }

  const handleDelete = () => {
    setPreview(null)
    onImageDelete()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const displayImage = preview || currentImage

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div
        className="relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div
          className={cn(
            'relative h-24 w-24 rounded-full overflow-hidden border-4 border-border bg-muted sm:h-32 sm:w-32',
            'transition-all duration-200',
            isHovering && 'ring-4 ring-primary/20'
          )}
        >
          {displayImage ? (
            <Image
              src={displayImage}
              alt="Profile avatar"
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <Camera className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          {isHovering && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Upload className="h-8 w-8 text-white" />
            </div>
          )}
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-background shadow-md"
          onClick={handleClick}
        >
          <Camera className="h-5 w-5" />
        </Button>

        {displayImage && (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-md"
            onClick={handleDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Click the camera icon to upload
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WEBP (max 5MB)
        </p>
      </div>
    </div>
  )
}
