const P = {
  cart: 'M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0 .01M18 20a1 1 0 1 0 0 .01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M7 17 17 7M8 7h9v9',
  'arrow-down': 'M7 7l10 10M17 8v9H8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  alert: 'M12 3 2 20h20zM12 10v5M12 18v.01',
  download: 'M12 3v12M7 11l5 5 5-5M5 20h14',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5L15.5 10',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  book: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  infinity: 'M7 8a4 4 0 1 0 0 8c4 0 6-8 10-8a4 4 0 1 1 0 8c-4 0-6-8-10-8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  message: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  reply: 'M10 8 4 13l6 5v-3.5c5 0 8 1 10 4-.5-5-3.5-8.5-10-8.5z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  note: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  invoice: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 7M22 21c0-3-1.5-5-4-5.8',
  tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  dollar: 'M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 8s2 2.8 4 3.2 4 1.2 4 3.3-1.8 3-4 3-4-1-4-2.5',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  file: 'M7 3h8l4 4v14H7zM15 3v4h4',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  headset: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H4zM17 14h3v5h-3z',
};

export function Icon({ name, size = 20, stroke = 1.8, fill = 'none', ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name] || P.book} />
    </svg>
  );
}
