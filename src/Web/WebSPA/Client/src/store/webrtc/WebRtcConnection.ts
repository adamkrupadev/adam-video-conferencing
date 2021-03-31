import { HubConnection } from '@microsoft/signalr';
import debug from 'debug';
import { EventEmitter } from 'events';
import { Device } from 'mediasoup-client';
import { Consumer, MediaKind, RtpParameters, Transport } from 'mediasoup-client/lib/types';
import { HubSubscription, subscribeEvent, unsubscribeAll } from 'src/utils/signalr-utils';
import SfuClient from './sfu-client';
import { ChangeStreamRequest, ProducerSource } from './types';

const PC_PROPRIETARY_CONSTRAINTS = {
   optional: [{ googDscp: true }],
};

const log = debug('webrtc:connection');

type OnNewConsumerPayload = {
   participantId: string;
   producerId: string;
   id: string;
   kind: MediaKind;
   rtpParameters: RtpParameters;
   type: string;
   appData: any;
   producerPaused: boolean;
};

type ConsumerInfoPayload = {
   consumerId: string;
};

type ConsumerScorePayload = ConsumerInfoPayload & {
   consumerId: string;
   score: number;
};

export type ProducerChangedEventArgs = {
   source: ProducerSource;
   action: 'pause' | 'resume' | 'close';
   producerId: string;
};

export class WebRtcConnection {
   /** all current consumers */
   private consumers = new Map<string, Consumer>();

   /** the latest received score for all consumers */
   private consumerScores = new Map<string, number>();

   /** SignalR methods that were subscribed. Must be memorized for unsubscription in close() */
   private signalrSubscription = new Array<HubSubscription>();

   constructor(private connection: HubConnection, private client: SfuClient) {
      this.device = new Device();

      this.signalrSubscription.push(
         subscribeEvent(connection, 'newConsumer', this.onNewConsumer.bind(this)),
         subscribeEvent(connection, 'consumerClosed', this.onConsumerClosed.bind(this)),
         subscribeEvent(connection, 'consumerScore', this.onConsumerScore.bind(this)),

         subscribeEvent(connection, 'consumerPaused', this.onConsumerPaused.bind(this)),
         subscribeEvent(connection, 'consumerResumed', this.onConsumerResumed.bind(this)),
         subscribeEvent(connection, 'producerChanged', this.onProducerChanged.bind(this)),
      );
   }

   public eventEmitter = new EventEmitter();

   public device: Device;
   public sendTransport: Transport | null = null;
   public receiveTransport: Transport | null = null;

   public canProduceVideo() {
      return this.device.canProduce('video');
   }

   public canProduceAudio() {
      return this.device.canProduce('audio');
   }

   public getConsumers(): IterableIterator<Consumer> {
      return this.consumers.values();
   }

   public close(): void {
      log('Close connection');

      this.sendTransport?.close();
      this.receiveTransport?.close();

      for (const consumer of this.consumers.values()) {
         consumer.close();
      }

      this.consumers.clear();
      this.eventEmitter.emit('onConsumersChanged');

      unsubscribeAll(this.connection, this.signalrSubscription);
   }

   private async onNewConsumer({ id, producerId, kind, rtpParameters, appData, participantId }: OnNewConsumerPayload) {
      if (!this.receiveTransport) {
         log('received new consumer, but receive transport is not initialized');
         return;
      }

      log('[Consumer: %s] Received new consumer event, try to process...', id);

      try {
         const consumer = await this.receiveTransport.consume({
            id,
            rtpParameters,
            kind,
            producerId,
            appData: { ...appData, participantId },
         });

         this.consumers.set(consumer.id, consumer);
         consumer.on('transportclose', () => this.consumers.delete(consumer.id));

         this.eventEmitter.emit('onConsumersChanged');
         log('[Consumer: %s] Consumer added successfully', id);
      } catch (error) {
         log('[Consumer: %s] Error on adding consumer %O', id, error);
      }
   }

   private onConsumerClosed({ consumerId }: ConsumerInfoPayload) {
      const consumer = this.consumers.get(consumerId);

      if (consumer) {
         consumer.close();
         this.consumers.delete(consumerId);
         this.consumerScores.delete(consumerId);
         this.eventEmitter.emit('onConsumerUpdated', { consumerId });

         log('[Consumer: %s] Removed', consumerId);
      } else {
         log('[Consumer: %s] Received consumer closed event, but consumer was not found', consumerId);
      }
   }

   private onConsumerPaused({ consumerId }: ConsumerInfoPayload) {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
         consumer.pause();
         this.consumerScores.delete(consumerId);
         this.eventEmitter.emit('onConsumerUpdated', { consumerId });

         log('[Consumer: %s] Paused', consumerId);
      } else {
         log('[Consumer: %s] Received consumer paused event, but consumer was not found', consumerId);
      }
   }

   private onConsumerResumed({ consumerId }: ConsumerInfoPayload) {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
         consumer.resume();
         this.eventEmitter.emit('onConsumerUpdated', { consumerId });

         log('[Consumer: %s] Resumed', consumerId);
      } else {
         log('[Consumer: %s] Received consumer resumed event, but consumer was not found', consumerId);
      }
   }

   private onProducerChanged(args: ProducerChangedEventArgs) {
      this.eventEmitter.emit('onProducerChanged', args);
   }

   private onConsumerScore({ consumerId, score }: ConsumerScorePayload) {
      this.consumerScores.set(consumerId, score);
      this.eventEmitter.emit('onConsumerScoreUpdated', { consumerId });

      log('[Consumer: %s] Receive consumer score: %d', consumerId, score);
   }

   public async createSendTransport(): Promise<Transport> {
      const transportOptions = await this.client.createTransport({
         sctpCapabilities: this.device.sctpCapabilities,
         producing: true,
         consuming: false,
      });

      if (!transportOptions.success) {
         log('Error creating send transport: ', transportOptions.error);
         throw new Error('Error creating send transport.');
      }

      log('Created send transport successfully, initialize now...');

      const transport = this.device.createSendTransport({
         ...transportOptions.response,
         iceServers: [],
         proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
      });

      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
         log('[Transport: %s] Attempt to connect local transport...', transport.id);

         this.client
            .connectTransport({ transportId: transport.id, dtlsParameters })
            .then((response) => {
               log('[Transport: %s] Remote transport connection response, success: %s', transport.id, response.success);

               if (response.success) callback();
               else errback();
            })
            .catch((err) => {
               log('[Transport: %s] Remote transport connection failed: %O', transport.id, err);
               errback();
            });
      });

      transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
         try {
            log('[Transport: %s] Local transport send attempt to produce...', transport.id);
            const result = await this.client.transportProduce({
               transportId: transport.id,
               kind,
               rtpParameters,
               appData,
            });

            if (result.success) {
               log('[Transport: %s] Response was successful, producer id: %s', transport.id, result.response.id);
               callback({ id: result.response.id });
            } else {
               log('[Transport: %s] Response failure: %O', transport.id, result.error);
               errback(result.error);
            }
         } catch (error) {
            log('[Transport: %s] Request failure: %O', transport.id, error);
            errback(error);
         }
      });

      this.sendTransport = transport;
      return transport;
   }

   public async createReceiveTransport(): Promise<Transport> {
      const transportOptions = await this.client.createTransport({ producing: false, consuming: true });

      if (!transportOptions.success) {
         console.error('Error creating receive transport: ', transportOptions.error);
         throw new Error('Error creating receive transport.');
      }

      const transport = this.device.createRecvTransport(transportOptions.response);

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
         log('[Transport: %s] Attempt to connect local receive transport...', transport.id);

         this.client
            .connectTransport({ transportId: transport.id, dtlsParameters })
            .then((response) => {
               log(
                  '[Transport: %s] Remote receive transport connection response, success: %s',
                  transport.id,
                  response.success,
               );

               if (response.success) callback();
               else errback(response.error);
            })
            .catch((err) => {
               log('[Transport: %s] Remote receive transport connection failed: %O', transport.id, err);
               errback();
            });
      });

      this.receiveTransport = transport;
      return transport;
   }

   public async changeStream(request: ChangeStreamRequest): Promise<void> {
      const result = await this.client.changeStream(request);
      if (!result.success) {
         log('Change stream %O failure: %O', request, result.error);
         throw new Error(result.error.message);
      }
   }
}
