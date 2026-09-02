import { colorForName, initials } from '../../utils/image';

// Circular avatar — the uploaded photo if there is one, otherwise a
// deterministic pastel initials circle. Used everywhere in Go Social.
export default function Avatar({ name, src, size = 40, ring }) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.round(size * 0.4),
    fontWeight: 600,
    color: '#fff',
    background: colorForName(name),
    ...(ring ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${ring}` } : {}),
  };

  if (src) {
    return <img src={src} alt={name ? `${name}'s photo` : ''} style={style} />;
  }
  return <div style={style} aria-hidden="true">{initials(name)}</div>;
}
