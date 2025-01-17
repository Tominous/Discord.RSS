const ArticleMessageQueue = require('../../structs/ArticleMessageQueue.js')
const ArticleMessage = require('../../structs/ArticleMessage.js')
const ArticleMessageError = require('../../structs/errors/ArticleMessageError.js')

jest.mock('../../structs/ArticleMessage.js')
jest.mock('../../config.js')

class Bot {
  constructor () {
    this.channels = {
      get: jest.fn((id) => new Channel(id))
    }
  }
}

class Guild {
  constructor () {
    this.roles = {
      get: jest.fn()
    }
  }
}

class Channel {
  constructor (id = '') {
    this.id = id
    this.guild = new Guild()
  }
}

class Role {
  constructor (mentionable = false) {
    this.mentionable = mentionable
    this.setMentionable = jest.fn(mention => {
      return new Promise((resolve, reject) => {
        this.mentionable = mention
        resolve()
      })
    })
  }
}

describe('Int::ArticleMessageQueue', function () {
  afterEach(function () {
    ArticleMessage.mockRestore()
  })
  describe('articles with no subscriptions', function () {
    it('calls send on article after enqueue', async function () {
      const queue = new ArticleMessageQueue()
      await queue.enqueue({})
      expect(ArticleMessage.mock.instances[0].send).toHaveBeenCalledTimes(1)
    })
    it('calls send on all articles after many enqueues', async function () {
      const queue = new ArticleMessageQueue()
      const times = 4
      for (let i = 0; i < times; ++i) {
        await queue.enqueue({})
      }
      for (let i = 0; i < times; ++i) {
        expect(ArticleMessage.mock.instances[i].send).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('article with subscriptions', function () {
    it('calls send on all articles', async function () {
      const queue = new ArticleMessageQueue()
      ArticleMessage.mockImplementationOnce(function () {
        this.toggleRoleMentions = true
        this.subscriptionIds = ['a']
      })
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.send(new Bot())
      expect(ArticleMessage.mock.instances[0].send).toHaveBeenCalledTimes(1)
      expect(ArticleMessage.mock.instances[1].send).toHaveBeenCalledTimes(1)
      expect(ArticleMessage.mock.instances[2].send).toHaveBeenCalledTimes(1)
    })
    it('only calls toggleRoleMentions twice for many articles', async function () {
      const queue = new ArticleMessageQueue()
      const spy = jest.spyOn(ArticleMessageQueue, 'toggleRoleMentionable')
      ArticleMessage.mockImplementation(function () {
        this.toggleRoleMentions = true
        this.subscriptionIds = ['a']
        this.channelId = 'abc'
      })
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.send(new Bot())
      expect(spy).toHaveBeenCalledTimes(2)
      spy.mockRestore()
    })
    it('clears out the queue after sending', async function () {
      const queue = new ArticleMessageQueue()
      const channelID = 'sfxdrgtrn'
      ArticleMessage.mockImplementation(function () {
        this.toggleRoleMentions = true
        this.subscriptionIds = ['a']
        this.channelId = channelID
      })
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.send(new Bot())
      expect(queue.queuesWithSubs[channelID]).toBeUndefined()
    })
    it('toggles role mentions for every role', async function () {
      const queue = new ArticleMessageQueue()
      const bot = new Bot()
      const channelOneID = 'abc'
      const channelTwoID = 'def'
      const channelOne = new Channel(channelOneID)
      const channelTwo = new Channel(channelTwoID)
      const guildOne = new Guild()
      const guildTwo = new Guild()
      const roleA = new Role()
      const roleB = new Role()
      channelOne.guild = guildOne
      channelTwo.guild = guildTwo
      bot.channels.get
        .mockReturnValueOnce(channelOne)
        .mockReturnValueOnce(channelTwo)
        .mockReturnValueOnce(channelOne)
        .mockReturnValueOnce(channelTwo)
      guildOne.roles.get.mockReturnValue(roleA)
      guildTwo.roles.get.mockReturnValue(roleB)
      ArticleMessage.mockImplementationOnce(function () {
        this.channelId = channelOneID
        this.toggleRoleMentions = true
        this.subscriptionIds = [1]
      }).mockImplementationOnce(function () {
        this.channelId = channelTwoID
        this.toggleRoleMentions = true
        this.subscriptionIds = [2]
      })
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.send(bot)
      expect(roleA.setMentionable).toHaveBeenNthCalledWith(1, true)
      expect(roleA.setMentionable).toHaveBeenNthCalledWith(2, false)
      expect(roleB.setMentionable).toHaveBeenNthCalledWith(1, true)
      expect(roleB.setMentionable).toHaveBeenNthCalledWith(2, false)
    })
    it('does not throw an error if role.setMentionable throws a code-50013 error', async function () {
      const queue = new ArticleMessageQueue()
      const bot = new Bot()
      const channelOneID = 'abc'
      const channelOne = new Channel(channelOneID)
      const guildOne = new Guild()
      const roleA = new Role()
      const error = new Error('perm error')
      error.code = 50013
      roleA.setMentionable.mockRejectedValue(error)
      channelOne.guild = guildOne
      bot.channels.get
        .mockReturnValue(channelOne)
      guildOne.roles.get.mockReturnValue(roleA)
      ArticleMessage.mockImplementationOnce(function () {
        this.channelId = channelOneID
        this.toggleRoleMentions = true
        this.subscriptionIds = [1]
      })
      await queue.enqueue({})
      await queue.enqueue({})
      await queue.send(bot)
    })
    it('throws the error that articleMessage.send throws, if it is not a non-50013-code error', function (done) {
      const queue = new ArticleMessageQueue()
      const bot = new Bot()
      const channelOneID = 'abc'
      const channelOne = new Channel(channelOneID)
      const guildOne = new Guild()
      const error = new Error('abc')
      channelOne.guild = guildOne
      bot.channels.get
        .mockReturnValue(channelOne)
      ArticleMessage.mockImplementation(function () {
        this.channelId = channelOneID
        this.toggleRoleMentions = true
        this.subscriptionIds = [1]
        this.send = async () => { throw error }
      })
      queue.enqueue({})
        .then(() => queue.enqueue({}))
        .then(() => queue.send(bot))
        .then(() => done(new Error('Promise resolved')))
        .catch(err => {
          expect(err).toBeInstanceOf(ArticleMessageError)
          expect(err.message).toEqual(error.message)
          done()
        })
        .catch(done)
    })
  })
})
