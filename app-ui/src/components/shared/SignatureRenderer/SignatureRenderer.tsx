import React from 'react';

interface SignatureRendererProps {
  signatureUrl: string | null | undefined;
  name?: string | null;
  designation: string;
  maxHeight?: number;
  maxWidth?: number;
  opacity?: number;
  monochrome?: boolean;
  alignToBaseline?: boolean;
  style?: React.CSSProperties;
}

/**
 * Reusable SignatureRenderer Component
 *
 * Exposes high-quality image scaling, aspect ratio preservation, baseline alignment,
 * and visual customizations (monochrome filter, opacity) for all digital signatures.
 */
export const SignatureRenderer: React.FC<SignatureRendererProps> = ({
  signatureUrl,
  name,
  designation,
  maxHeight = 36,
  maxWidth = 140,
  opacity = 1,
  monochrome = false,
  alignToBaseline = true,
  style,
}) => {
  const imgStyle: React.CSSProperties = {
    maxWidth: maxWidth,
    maxHeight: maxHeight,
    objectFit: 'contain',
    display: 'block',
    opacity: opacity,
    imageRendering: 'auto', // High-quality interpolation mapping
    filter: monochrome ? 'grayscale(100%) contrast(150%)' : 'none',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        ...style,
      }}
    >
      {/* Signature Image Viewport */}
      <div
        style={{
          height: maxHeight + 4,
          display: 'flex',
          alignItems: alignToBaseline ? 'flex-end' : 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {signatureUrl ? (
          <img src={signatureUrl} alt={`${designation} signature`} style={imgStyle} />
        ) : (
          <div style={{ height: maxHeight }} />
        )}
      </div>

      {/* Signature baseline line */}
      <div
        style={{
          width: '80%',
          borderTop: '1px solid #0f172a',
          marginTop: 4,
          marginBottom: 4,
        }}
      />

      {/* Signature Name and Designation */}
      <div style={{ textAlign: 'center', fontSize: 11, lineHeight: '1.4' }}>
        {name && <div style={{ fontWeight: 700, color: '#0F172A' }}>{name}</div>}
        <div style={{ color: '#475569', fontSize: 9.5, fontWeight: 500 }}>{designation}</div>
      </div>
    </div>
  );
};

export default SignatureRenderer;
