import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer does not exist');
    }

    const storedProducts = await this.productsRepository.findAllById(
      products.map(product => ({
        id: product.id,
      })),
    );

    if (!storedProducts || storedProducts.length !== products.length) {
      throw new AppError('Invalid products');
    }

    const updatedQuantity = storedProducts.map(storedProduct => {
      const { quantity: requested_quantity } =
        products.find(p => p.id === storedProduct.id) || ({} as IProduct);
      const remainingQuantity = storedProduct.quantity - requested_quantity;

      if (remainingQuantity < 0) {
        throw new AppError(
          `Product ${storedProduct.name} has quantity ${storedProduct.quantity} and` +
            ` the request could not be processed.`,
        );
      }

      return {
        id: storedProduct.id,
        price: storedProduct.price,
        quantity: remainingQuantity,
        requested_quantity,
      };
    });

    await this.productsRepository.updateQuantity(updatedQuantity);

    const order = await this.ordersRepository.create({
      customer,
      products: updatedQuantity.map(updatedProduct => ({
        product_id: updatedProduct.id,
        price: updatedProduct.price,
        quantity: updatedProduct.requested_quantity,
      })),
    });

    return order;
  }
}

export default CreateOrderService;
