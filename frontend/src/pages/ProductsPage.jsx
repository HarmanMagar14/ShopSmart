import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../services/api.js';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Category choices come from the full catalog so search results never shrink the list.
  const [categories, setCategories] = useState(['All']);
  const { addToCart, cartMessage } = useCart();

  const term = search.trim();

  useEffect(() => {
    // `active` lets us ignore a response that arrives after the search term has changed.
    let active = true;
    setLoading(true);
    setError('');
    // Wait briefly so typing does not send a request for every keystroke.
    const timer = setTimeout(() => {
      api.getProducts(term)
        .then((data) => {
          if (!active) return;
          setProducts(data.products);
          if (!term) setCategories(['All', ...new Set(data.products.map((product) => product.category))]);
        })
        .catch((caught) => {
          if (!active) return;
          setError(caught.message);
          setProducts([]);
        })
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  // The server already applied the search term; category is filtered here.
  const filteredProducts = products.filter(
    (product) => category === 'All' || product.category === category
  );

  // Sort a copy so the original products array keeps its catalog order for "Default".
  const visibleProducts = sort === 'default'
    ? filteredProducts
    : [...filteredProducts].sort((a, b) => {
      if (sort === 'price-asc') return Number(a.price) - Number(b.price);
      if (sort === 'price-desc') return Number(b.price) - Number(a.price);
      if (sort === 'name-asc') return a.name.localeCompare(b.name);
      return 0;
    });

  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow">BSIT FULL-STACK PROJECT</p>
          <h1>Technology for study, work and play</h1>
          <p>Browse the starter catalog, build a cart and complete a simulated order.</p>
        </div>
      </div>

      <div className="toolbar">
        <label>
          <span>Search products</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try keyboard" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="default">Default</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A–Z</option>
          </select>
        </label>
      </div>

      <StatusMessage>{cartMessage}</StatusMessage>
      {loading && <StatusMessage>{term ? `Searching for "${term}"…` : 'Loading products…'}</StatusMessage>}
      {error && <StatusMessage type="error">{error}</StatusMessage>}
      {!loading && !error && visibleProducts.length === 0 && (
        <StatusMessage>
          {term ? `No products match "${term}"` : 'No products'}
          {category !== 'All' ? ` in ${category}.` : '.'}
        </StatusMessage>
      )}

      <div className="product-grid">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
        ))}
      </div>
    </section>
  );
}
