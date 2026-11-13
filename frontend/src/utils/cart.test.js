import { describe, expect, it } from 'vitest';
import {
addProductToCart, calculateCartItemCount,
calculateCartTotal, updateCartQuantity
} from './cart.js';

it('counts all cart units and handles an empty cart', () => {
  expect(calculateCartItemCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  expect(calculateCartItemCount([])).toBe(0);
});

describe('cart utilities', () => {
  it('calculates the cart total', () => {
    expect(calculateCartTotal([
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 }
    ])).toBe(350);
  });

  it('adds a new product', () => {
    const result = addProductToCart([], { id: 1, name: 'Mouse', price: 500, stock: 2 });
    expect(result.error).toBe('');
    expect(result.cart[0].quantity).toBe(1);
  });

  it('prevents a quantity above stock', () => {
    const cart = [{ productId: 1, name: 'Mouse', price: 500, stock: 1, quantity: 1 }];
    expect(updateCartQuantity(cart, 1, 2).error).toContain('Only 1');
  });
});

describe('quantity button boundaries', () => {
  const cart = [
    { productId: 1, name: 'Mouse', price: 500, stock: 3, quantity: 2 },
    { productId: 2, name: 'Keyboard', price: 1200, stock: 5, quantity: 1 }
  ];

  it('increases only the chosen item by one', () => {
    const result = updateCartQuantity(cart, 1, cart[0].quantity + 1);
    expect(result.error).toBe('');
    expect(result.cart[0].quantity).toBe(3);
    expect(result.cart[1].quantity).toBe(1);
  });

  it('decreases by one down to a minimum of one', () => {
    expect(updateCartQuantity(cart, 1, cart[0].quantity - 1).cart[0].quantity).toBe(1);
  });

  it('rejects decreasing below one and keeps the cart unchanged', () => {
    const result = updateCartQuantity(cart, 2, cart[1].quantity - 1);
    expect(result.error).toContain('greater than zero');
    expect(result.cart).toBe(cart);
  });

  it('rejects increasing past available stock', () => {
    const atStock = updateCartQuantity(cart, 1, 3).cart;
    const result = updateCartQuantity(atStock, 1, 4);
    expect(result.error).toContain('Only 3');
    expect(result.cart[0].quantity).toBe(3);
  });
});
