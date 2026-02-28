import type { Product } from '../types';

export const parseXML = (xml: string): Product[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'text/xml');
  const items = xmlDoc.getElementsByTagName('item');
  const getTag = (parent: Element, tags: string[]) => {
    for (const tag of tags) {
      const els = parent.getElementsByTagName(tag);
      if (els.length > 0 && els[0].textContent) return els[0].textContent;
    }
    return '';
  };
  return Array.from(items).map((item, i) => ({
    id: getTag(item, ['g:id', 'id']) || `unknown-${i}`,
    name: getTag(item, ['title', 'g:title']) || 'Unknown',
    description: getTag(item, ['description', 'g:description']) || '',
    link: getTag(item, ['link', 'g:link']) || '',
    image_link: getTag(item, ['g:image_link', 'image_link', 'image']) || '',
    price: getTag(item, ['g:price', 'price']) || '',
  }));
};
