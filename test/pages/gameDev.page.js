import { $ } from '@wdio/globals'

class GameDevPage {

    get companyGameDevsRateLink() { 
        return $('//*[text()="Топ-25 компаній"]') 
    }
    
    get topGamesRateLink() { 
        return $('//*[text()="Ігри місяця"]') 
    }
}

export default new GameDevPage()