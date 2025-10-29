'use strict';

const { Kafka } = require('kafkajs');
const kafka = new Kafka({
  clientId: 'hub',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

class Publisher {

  construct() {
    this.connect();
  }

  async connect() {
    await producer.connect();
  }

  publish(topic, message) {
    producer.send({
      topic,
      message: [
        {
          value: message,
        },
      ],
    });

  }

}

module.exports = Publisher;
