declare namespace MusicKit {
  interface AppConfiguration {
    name: string
    build: string
  }

  interface Configuration {
    developerToken: string
    app: AppConfiguration
  }

  interface MusicKitInstance {
    authorize(): Promise<string>
    unauthorize(): Promise<void>
    isAuthorized: boolean
    musicUserToken: string
  }

  function configure(config: Configuration): Promise<MusicKitInstance>
}
