import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Plus, Minus, Upload } from 'lucide-react';
import './ImageCropper.css';

interface ImageCropperProps {
  imageSrc: string;
  onConfirm: (croppedImageBase64: string) => void;
  onClose: () => void;
  onSelectNewFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ImageCropper({ imageSrc, onConfirm, onClose, onSelectNewFile }: ImageCropperProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset controls on image source change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [imageSrc]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    dragStart.current = {
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y
    });
  };

  const handleConfirm = () => {
    if (!imageRef.current) return;

    const canvas = document.createElement('canvas');
    const cropSize = 300;
    canvas.width = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, cropSize, cropSize);

      const img = imageRef.current;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // Fit image inside crop viewport under scale = 1
      const viewportSize = 280; // matches CSS preview crop circle diameter
      const baseScale = Math.max(viewportSize / naturalWidth, viewportSize / naturalHeight);
      
      const renderWidth = naturalWidth * baseScale * scale;
      const renderHeight = naturalHeight * baseScale * scale;

      // Calculate translation scaling factor from viewport (280px) to canvas output (300px)
      const scaleFactor = cropSize / viewportSize;
      
      const dx = (cropSize - renderWidth) / 2 + position.x * scaleFactor;
      const dy = (cropSize - renderHeight) / 2 + position.y * scaleFactor;

      ctx.drawImage(img, dx, dy, renderWidth, renderHeight);
      
      try {
        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        onConfirm(base64);
      } catch (err) {
        console.error('Failed to crop image:', err);
      }
    }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 1));

  return (
    <div className="cropper-overlay" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="cropper-modal">
        {/* Header */}
        <div className="cropper-header">
          <button className="header-icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
          <span className="header-title">Drag the image to adjust</span>
          
          {onSelectNewFile ? (
            <label className="header-upload-btn">
              <Upload size={16} />
              <span>Upload</span>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={onSelectNewFile} 
                style={{ display: 'none' }} 
              />
            </label>
          ) : (
            <div style={{ width: '40px' }} />
          )}
        </div>

        {/* Cropper Viewport Container */}
        <div 
          className="cropper-body"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Image Layer */}
          <div 
            className="cropper-image-container"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            <img 
              ref={imageRef}
              src={imageSrc} 
              alt="Source to crop" 
              className="cropper-source-img"
              draggable="false"
            />
          </div>

          {/* WhatsApp Circular Mask Overlay */}
          <div className="cropper-circular-mask">
            <div className="cropper-viewfinder"></div>
          </div>

          {/* Floating Zoom Controls (+ / -) */}
          <div className="cropper-zoom-sidebar">
            <button className="zoom-btn" onClick={handleZoomIn}>
              <Plus size={16} />
            </button>
            <div className="zoom-indicator">
              {Math.round(scale * 100)}%
            </div>
            <button className="zoom-btn" onClick={handleZoomOut}>
              <Minus size={16} />
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="cropper-footer">
          <button className="confirm-check-btn" onClick={handleConfirm}>
            <Check size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
