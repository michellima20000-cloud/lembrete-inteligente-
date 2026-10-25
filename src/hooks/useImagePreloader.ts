import { useState, useEffect } from 'react';
import { preloadImages, CRITICAL_APP_IMAGES } from '../utils/imagePreloader';

export function useImagePreloader(customUrls?: string[]) {
  const [isImagesLoaded, setIsImagesLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const urlsToLoad = customUrls && customUrls.length > 0 ? customUrls : CRITICAL_APP_IMAGES;

    preloadImages(urlsToLoad).then(() => {
      if (isMounted) {
        setIsImagesLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [customUrls]);

  return { isImagesLoaded };
}
