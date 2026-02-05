import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Link as LinkIcon, Search, Loader2, Upload, Plus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalBlob } from '../backend';

interface MediaPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

interface TenorMedia {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface CustomSticker {
  id: string;
  bytes: string; // Base64-encoded bytes for persistence
  preview: string;
  timestamp: number;
}

// Tenor API key - using a public demo key
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

// Sticker TTL: 24 hours (matching message TTL)
const STICKER_TTL_MS = 24 * 60 * 60 * 1000;

export default function MediaPicker({ onSelect, onClose }: MediaPickerProps) {
  const [customUrl, setCustomUrl] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<TenorMedia[]>([]);
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const stickerInputRef = useRef<HTMLInputElement>(null);

  // Load custom stickers from localStorage on mount
  useEffect(() => {
    loadCustomStickers();
  }, []);

  // Fetch trending GIFs on mount
  useEffect(() => {
    fetchTrendingGifs();
  }, []);

  const loadCustomStickers = () => {
    try {
      const stored = localStorage.getItem('customStickers');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out stickers older than 24 hours
        const expiryTime = Date.now() - STICKER_TTL_MS;
        const validStickers = parsed.filter((s: CustomSticker) => s.timestamp > expiryTime);
        
        setCustomStickers(validStickers);
        
        // Save back filtered stickers
        if (validStickers.length !== parsed.length) {
          saveCustomStickers(validStickers);
        }
      }
    } catch (error) {
      console.error('Error loading custom stickers:', error);
    }
  };

  const saveCustomStickers = (stickers: CustomSticker[]) => {
    try {
      localStorage.setItem('customStickers', JSON.stringify(stickers));
    } catch (error) {
      console.error('Error saving custom stickers:', error);
    }
  };

  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, or WEBP)');
      return;
    }

    // Validate file size (max 2MB for stickers)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Sticker size must be less than 2MB');
      return;
    }

    setUploadingSticker(true);
    setUploadProgress(0);

    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64 for persistent storage
      const base64 = btoa(String.fromCharCode(...uint8Array));
      
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      
      // Create new sticker
      const newSticker: CustomSticker = {
        id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        bytes: base64,
        preview: previewUrl,
        timestamp: Date.now(),
      };
      
      // Add to stickers list
      const updatedStickers = [...customStickers, newSticker];
      setCustomStickers(updatedStickers);
      saveCustomStickers(updatedStickers);
      
      toast.success('Sticker uploaded successfully!');
    } catch (error) {
      console.error('Error uploading sticker:', error);
      toast.error('Failed to upload sticker');
    } finally {
      setUploadingSticker(false);
      setUploadProgress(0);
      
      // Reset file input
      if (stickerInputRef.current) {
        stickerInputRef.current.value = '';
      }
    }
  };

  const handleStickerSelect = async (sticker: CustomSticker) => {
    try {
      // Reconstruct ExternalBlob from stored base64 bytes
      const binaryString = atob(sticker.bytes);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = ExternalBlob.fromBytes(bytes);
      const blobUrl = blob.getDirectURL();
      
      // Send the blob URL
      onSelect(blobUrl);
    } catch (error) {
      console.error('Error loading sticker:', error);
      toast.error('Failed to load sticker');
    }
  };

  const handleDeleteSticker = (stickerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedStickers = customStickers.filter(s => s.id !== stickerId);
    setCustomStickers(updatedStickers);
    saveCustomStickers(updatedStickers);
    toast.success('Sticker removed');
  };

  const fetchTrendingGifs = async () => {
    setLoadingGifs(true);
    try {
      const response = await fetch(
        `${TENOR_BASE_URL}/featured?key=${TENOR_API_KEY}&contentfilter=high&media_filter=gif&limit=20`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch GIFs');
      }
      
      const data = await response.json();
      
      if (data.results) {
        const mediaItems: TenorMedia[] = data.results.map((item: any) => ({
          id: item.id,
          url: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
          preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
          title: item.content_description || 'GIF',
        })).filter((item: TenorMedia) => item.url && item.preview);
        setGifs(mediaItems);
      }
    } catch (error) {
      console.error('Error fetching trending GIFs:', error);
      toast.error('Failed to load trending GIFs');
    } finally {
      setLoadingGifs(false);
    }
  };

  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      fetchTrendingGifs();
      return;
    }

    setLoadingGifs(true);
    try {
      const response = await fetch(
        `${TENOR_BASE_URL}/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(query)}&contentfilter=high&media_filter=gif&limit=20`
      );
      
      if (!response.ok) {
        throw new Error('Failed to search GIFs');
      }
      
      const data = await response.json();
      
      if (data.results) {
        const mediaItems: TenorMedia[] = data.results.map((item: any) => ({
          id: item.id,
          url: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
          preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
          title: item.content_description || 'GIF',
        })).filter((item: TenorMedia) => item.url && item.preview);
        setGifs(mediaItems);
      }
    } catch (error) {
      console.error('Error searching GIFs:', error);
      toast.error('Failed to search GIFs');
    } finally {
      setLoadingGifs(false);
    }
  };

  const handleCustomUrl = () => {
    if (!customUrl.trim()) {
      toast.error('Please enter a URL');
      return;
    }
    
    // Basic URL validation
    try {
      new URL(customUrl.trim());
      onSelect(customUrl.trim());
      setCustomUrl('');
    } catch {
      toast.error('Please enter a valid URL');
    }
  };

  const handleGifSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchGifs(gifSearch);
  };

  return (
    <Card className="w-96 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Add Media</CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="gifs" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gifs">GIFs</TabsTrigger>
            <TabsTrigger value="stickers">My Stickers</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
          </TabsList>
          
          <TabsContent value="gifs" className="space-y-2">
            <form onSubmit={handleGifSearch} className="flex gap-2">
              <Input
                placeholder="Search GIFs..."
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="icon" variant="secondary">
                <Search className="h-4 w-4" />
              </Button>
            </form>
            
            <ScrollArea className="h-64">
              {loadingGifs ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : gifs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No GIFs found
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-1">
                  {gifs.map((gif) => (
                    <button
                      key={gif.id}
                      onClick={() => onSelect(gif.url)}
                      className="aspect-video rounded-lg border-2 border-transparent hover:border-primary transition-colors overflow-hidden bg-muted/50"
                      title={gif.title}
                    >
                      <img
                        src={gif.preview}
                        alt={gif.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
            <p className="text-xs text-muted-foreground text-center">Powered by Tenor</p>
          </TabsContent>
          
          <TabsContent value="stickers" className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {customStickers.length} sticker{customStickers.length !== 1 ? 's' : ''}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => stickerInputRef.current?.click()}
                disabled={uploadingSticker}
                className="gap-2"
              >
                {uploadingSticker ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
              <input
                ref={stickerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleStickerUpload}
                className="hidden"
              />
            </div>

            {uploadingSticker && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Uploading: {uploadProgress}%
                </p>
              </div>
            )}
            
            <ScrollArea className="h-64">
              {customStickers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <img
                    src="/assets/generated/sticker-upload-icon-transparent.dim_24x24.png"
                    alt="No stickers"
                    className="h-12 w-12 mb-3 opacity-50"
                  />
                  <p className="text-sm text-muted-foreground mb-2">
                    No custom stickers yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upload your own stickers to use in chat
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 p-1">
                  {customStickers.map((sticker) => (
                    <div
                      key={sticker.id}
                      className="relative group aspect-square rounded-lg border-2 border-transparent hover:border-primary transition-colors overflow-hidden bg-muted/50"
                    >
                      <button
                        onClick={() => handleStickerSelect(sticker)}
                        className="h-full w-full"
                        title="Click to send sticker"
                      >
                        <img
                          src={sticker.preview}
                          alt="Custom sticker"
                          className="h-full w-full object-contain p-1"
                          loading="lazy"
                        />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSticker(sticker.id, e)}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Remove sticker"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <p className="text-xs text-muted-foreground text-center">
              Stickers auto-delete after 24 hours
            </p>
          </TabsContent>
          
          <TabsContent value="url" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="media-url">Image or GIF URL</Label>
              <Input
                id="media-url"
                placeholder="https://example.com/image.gif"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomUrl()}
              />
            </div>
            <Button onClick={handleCustomUrl} className="w-full" size="sm">
              <LinkIcon className="mr-2 h-4 w-4" />
              Add URL
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
