import { initials } from '@/lib/format';

export function Crest({ name, imageUrl, large = false }: { name: string; imageUrl?: string | null; large?: boolean }) {
  const className = large ? 'identity-crest identity-crest-large' : 'identity-crest';
  if (imageUrl) return <img className={`${className} has-image`} src={imageUrl} alt={`${name} crest`} />;
  return <div className={className} aria-label={`${name} crest placeholder`}>{initials(name)}</div>;
}

export function PlayerAvatar({ name, imageUrl, large = false }: { name: string; imageUrl?: string | null; large?: boolean }) {
  const className = large ? 'player-avatar player-avatar-large' : 'player-avatar';
  if (imageUrl) return <img className={`${className} has-image`} src={imageUrl} alt={name} />;
  return <div className={className}>{initials(name)}</div>;
}
