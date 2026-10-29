import React from 'react';
import { Camera, Download, Globe, Send } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.js';
import type { PublicationChannel } from '../types/publishing.types.js';

interface ChannelBadgeProps {
  readonly channel: PublicationChannel;
  readonly className?: string;
}

export const ChannelBadge: React.FC<ChannelBadgeProps> = ({ channel, className }) => {
  switch (channel) {
    case 'TELEGRAM_CHANNEL':
      return (
        <Badge variant="navy" className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
          <Send className="w-3 h-3" />
          <span>Telegram</span>
        </Badge>
      );
    case 'FACEBOOK_PAGE':
      return (
        <Badge variant="neutral" className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
          <Globe className="w-3 h-3" />
          <span>Facebook</span>
        </Badge>
      );
    case 'INSTAGRAM':
      return (
        <Badge variant="gold" className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
          <Camera className="w-3 h-3" />
          <span>Instagram</span>
        </Badge>
      );
    case 'MANUAL_EXPORT':
      return (
        <Badge variant="good" className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
          <Download className="w-3 h-3" />
          <span>Manual Export</span>
        </Badge>
      );
    default:
      return <Badge variant="neutral">{channel}</Badge>;
  }
};
