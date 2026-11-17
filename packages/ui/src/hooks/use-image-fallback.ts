'use client'

import { useState } from 'react'

/** 图片失败只影响对应地址；迟到的旧图片错误不能隐藏新图片。 */
export function useImageFallback(src?: string) {
  const [failedSource, setFailedSource] = useState<string>()
  return {
    failed: !src || failedSource === src,
    onError: () => setFailedSource(src),
  }
}
