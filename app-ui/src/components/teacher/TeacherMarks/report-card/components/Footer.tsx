import React from 'react';

interface FooterProps {
  documentId: string;
  website: string;
  pageNumber: number;
  totalPages: number;
}

export const Footer: React.FC<FooterProps> = ({
  documentId,
  website,
  pageNumber,
  totalPages,
}) => {
  return (
    <div className="page-footer-banner">
      <div className="page-footer-left">
        <span>Verification ID: {documentId}</span>
        {website && (
          <>
            <span>|</span>
            <span>Website: {website}</span>
          </>
        )}
      </div>
      <div className="page-footer-right">
        <span>
          Page {pageNumber} of {totalPages}
        </span>
      </div>
    </div>
  );
};
export default Footer;
